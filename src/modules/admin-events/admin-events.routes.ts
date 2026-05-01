/**
 * @file admin-events.routes.ts
 * @description Admin CRUD for public marketing calendar events (separate from bookable sessions).
 * @module src/modules/admin-events/admin-events.routes
 */
import type { CalendarEventType, Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import nodemailer from 'nodemailer';
import { z } from 'zod';

import { env } from '@/config/env.js';
import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];

const API_TO_TYPE: Record<string, CalendarEventType> = {
  tournament: 'TOURNAMENT',
  'open-day': 'OPEN_DAY',
  camp: 'CAMP',
  'school-visit': 'SCHOOL_VISIT',
  other: 'OTHER',
};

const TYPE_TO_API: Record<CalendarEventType, string> = {
  TOURNAMENT: 'tournament',
  OPEN_DAY: 'open-day',
  CAMP: 'camp',
  SCHOOL_VISIT: 'school-visit',
  OTHER: 'other',
};

const EventIdParam = z.object({ eventId: z.string().min(1) });
const UK_POSTCODE_REGEX = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

const CreateEventSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['tournament', 'open-day', 'camp', 'school-visit', 'other']),
  date: z.string().min(1),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  location: z.string().min(1),
  category: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  minAgeYears: z.number().int().nonnegative().optional(),
  maxAgeYears: z.number().int().nonnegative().optional(),
  maxCapacity: z.number().int().positive().optional(),
  currency: z.string().default('GBP').optional(),
  subtotal: z.number().nonnegative().optional(),
  serviceFee: z.number().nonnegative().optional(),
  requirements: z
    .array(
      z.object({
        heading: z.string().min(1),
        items: z.array(z.string().min(1)),
      }),
    )
    .optional(),
  addons: z
    .array(
      z.object({
        code: z.string().min(1),
        label: z.string().min(1),
        price: z.number().nonnegative(),
        defaultSelected: z.boolean().optional(),
      }),
    )
    .optional(),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
  bannerId: z.string().optional(),
});

const UpdateEventSchema = CreateEventSchema.partial().extend({
  bannerId: z.union([z.string().min(1), z.null()]).optional(),
});

const VisibilitySchema = z.object({ isPublic: z.boolean() });
const SendRadiusEmailBodySchema = z.object({
  radiusKm: z.coerce.number().positive(),
  centerPostcode: z
    .string()
    .trim()
    .max(16)
    .nullish()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

function getTransporter() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}

function normalizePostcode(postcode: string): string {
  return postcode.trim().toUpperCase().replace(/\s+/g, '');
}

function extractPostcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(UK_POSTCODE_REGEX);
  if (!match?.[1]) return null;
  return normalizePostcode(match[1]);
}

async function geocodePostcode(postcode: string): Promise<{ latitude: number; longitude: number } | null> {
  const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    status?: number;
    result?: { latitude?: number | null; longitude?: number | null } | null;
  };
  const latitude = payload.result?.latitude;
  const longitude = payload.result?.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  return { latitude, longitude };
}

async function geocodeAddress(query: string): Promise<{ latitude: number; longitude: number } | null> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DDivine-Backend/1.0',
      },
    },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as Array<{ lat?: string; lon?: string }>;
  const first = payload[0];
  if (!first?.lat || !first?.lon) return null;
  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

async function geocodePostcodesBulk(postcodes: string[]): Promise<Map<string, { latitude: number; longitude: number }>> {
  const map = new Map<string, { latitude: number; longitude: number }>();
  const rawByNormalized = new Map<string, string>();
  for (const raw of postcodes) {
    const normalized = normalizePostcode(raw);
    if (!normalized) continue;
    if (!rawByNormalized.has(normalized)) {
      rawByNormalized.set(normalized, raw.trim());
    }
  }
  const unique = [...rawByNormalized.keys()];
  const chunkSize = 100;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const response = await fetch('https://api.postcodes.io/postcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcodes: chunk }),
    });
    if (!response.ok) continue;
    const payload = (await response.json()) as {
      status?: number;
      result?: Array<{
        query?: string;
        result?: { latitude?: number | null; longitude?: number | null } | null;
      }>;
    };
    for (const item of payload.result ?? []) {
      const query = item.query ? normalizePostcode(item.query) : null;
      const latitude = item.result?.latitude;
      const longitude = item.result?.longitude;
      if (!query || typeof latitude !== 'number' || typeof longitude !== 'number') continue;
      map.set(query, { latitude, longitude });
    }
  }

  // Fallback for non-UK or unresolved postcodes (e.g. PIN/ZIP not covered by postcodes.io).
  for (const normalized of unique) {
    if (map.has(normalized)) continue;
    const fallbackQuery = rawByNormalized.get(normalized) ?? normalized;
    const geo = await geocodeAddress(fallbackQuery);
    if (geo) {
      map.set(normalized, geo);
    }
  }

  return map;
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return earthRadiusKm * y;
}

function mapEvent(e: {
  id: string;
  title: string;
  description: string | null;
  type: CalendarEventType;
  category: string | null;
  date: Date;
  time: string;
  location: string;
  startDate: Date | null;
  endDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  minAgeYears: number | null;
  maxAgeYears: number | null;
  maxCapacity: number | null;
  currentCapacity: number;
  currency: string;
  subtotal: Prisma.Decimal;
  serviceFee: Prisma.Decimal;
  requirements: Prisma.JsonValue | null;
  addons: Prisma.JsonValue | null;
  isPublic: boolean;
  bannerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  banner: { id: string; url: string } | null;
}) {
  const availableSpots =
    e.maxCapacity !== null ? Math.max(0, e.maxCapacity - e.currentCapacity) : null;
  return {
    id: e.id,
    title: e.title,
    description: e.description ?? undefined,
    type: TYPE_TO_API[e.type],
    category: e.category ?? undefined,
    date: e.date.toISOString().split('T')[0],
    time: e.time,
    startDate: (e.startDate ?? e.date).toISOString().split('T')[0],
    endDate: (e.endDate ?? e.startDate ?? e.date).toISOString().split('T')[0],
    startTime: e.startTime ?? e.time,
    endTime: e.endTime ?? undefined,
    location: e.location,
    minAgeYears: e.minAgeYears ?? undefined,
    maxAgeYears: e.maxAgeYears ?? undefined,
    maxCapacity: e.maxCapacity ?? undefined,
    currentCapacity: e.currentCapacity,
    availableSpots: availableSpots ?? undefined,
    isSoldOut: availableSpots !== null ? availableSpots === 0 : false,
    currency: e.currency,
    subtotal: e.subtotal.toNumber(),
    serviceFee: e.serviceFee.toNumber(),
    requirements: e.requirements ?? undefined,
    addons: e.addons ?? undefined,
    isPublic: e.isPublic,
    bannerId: e.bannerId ?? undefined,
    bannerUrl: e.banner?.url,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

async function adminEventsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/events', {
    schema: {
      tags: ['Admin'],
      summary: 'List marketing calendar events',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          isPublic: { type: 'boolean' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
    },
    preHandler: adminGuard,
    handler: async (
      request: FastifyRequest<{
        Querystring: { type?: string; isPublic?: boolean; page?: number; pageSize?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const { type, isPublic, page = 1 } = request.query;
      const pageSize = Math.min(request.query.pageSize ?? 20, 100);
      const skip = (page - 1) * pageSize;
      const prismaType = type ? API_TO_TYPE[type] : undefined;
      if (type && !prismaType) {
        throw new AppError('VALIDATION_ERROR', 'Invalid event type filter.', 422);
      }
      const where = {
        ...(prismaType && { type: prismaType }),
        ...(isPublic !== undefined && { isPublic }),
      };
      const [rows, total] = await Promise.all([
        prisma.calendarEvent.findMany({
          where,
          include: { banner: { select: { id: true, url: true } } },
          skip,
          take: pageSize,
          orderBy: { date: 'asc' },
        }),
        prisma.calendarEvent.count({ where }),
      ]);
      await reply.status(200).send({
        data: rows.map(mapEvent),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });

  app.post('/api/v1/admin/events', {
    schema: { tags: ['Admin'], summary: 'Create marketing event', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ body: CreateEventSchema })],
    handler: async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateEventSchema> }>,
      reply: FastifyReply,
    ) => {
      const {
        title,
        type,
        date,
        time,
        location,
        category,
        startDate,
        endDate,
        startTime,
        endTime,
        minAgeYears,
        maxAgeYears,
        maxCapacity,
        currency,
        subtotal,
        serviceFee,
        requirements,
        addons,
        description,
        isPublic,
        bannerId,
      } = request.body;
      if (bannerId) {
        const m = await prisma.mediaAsset.findUnique({ where: { id: bannerId } });
        if (!m) throw new AppError('ACCOUNT_NOT_FOUND', 'Banner media not found.', 404);
      }
      const e = await prisma.calendarEvent.create({
        data: {
          title,
          type: API_TO_TYPE[type],
          date: new Date(date),
          time,
          location,
          category,
          startDate: startDate ? new Date(startDate) : new Date(date),
          endDate: endDate ? new Date(endDate) : startDate ? new Date(startDate) : new Date(date),
          startTime: startTime ?? time,
          endTime,
          minAgeYears,
          maxAgeYears,
          maxCapacity,
          currency: currency ?? 'GBP',
          subtotal: subtotal ?? 0,
          serviceFee: serviceFee ?? 0,
          requirements: requirements as Prisma.InputJsonValue | undefined,
          addons: addons as Prisma.InputJsonValue | undefined,
          description,
          isPublic: isPublic ?? false,
          bannerId,
        },
        include: { banner: { select: { id: true, url: true } } },
      });
      await reply.status(201).send(mapEvent(e));
    },
  });

  app.patch('/api/v1/admin/events/:eventId', {
    schema: { tags: ['Admin'], summary: 'Update marketing event', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: EventIdParam, body: UpdateEventSchema })],
    handler: async (
      request: FastifyRequest<{ Params: { eventId: string }; Body: z.infer<typeof UpdateEventSchema> }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.calendarEvent.findUnique({ where: { id: request.params.eventId } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);
      const b = request.body;
      if (b.bannerId) {
        const m = await prisma.mediaAsset.findUnique({ where: { id: b.bannerId } });
        if (!m) throw new AppError('ACCOUNT_NOT_FOUND', 'Banner media not found.', 404);
      }
      const data: Prisma.CalendarEventUpdateInput = {};
      if (b.title !== undefined) data.title = b.title;
      if (b.description !== undefined) data.description = b.description;
      if (b.type !== undefined) data.type = API_TO_TYPE[b.type];
      if (b.date !== undefined) data.date = new Date(b.date);
      if (b.time !== undefined) data.time = b.time;
      if (b.location !== undefined) data.location = b.location;
      if (b.category !== undefined) data.category = b.category;
      if (b.startDate !== undefined) data.startDate = new Date(b.startDate);
      if (b.endDate !== undefined) data.endDate = new Date(b.endDate);
      if (b.startTime !== undefined) data.startTime = b.startTime;
      if (b.endTime !== undefined) data.endTime = b.endTime;
      if (b.minAgeYears !== undefined) data.minAgeYears = b.minAgeYears;
      if (b.maxAgeYears !== undefined) data.maxAgeYears = b.maxAgeYears;
      if (b.maxCapacity !== undefined) data.maxCapacity = b.maxCapacity;
      if (b.currency !== undefined) data.currency = b.currency;
      if (b.subtotal !== undefined) data.subtotal = b.subtotal;
      if (b.serviceFee !== undefined) data.serviceFee = b.serviceFee;
      if (b.requirements !== undefined) data.requirements = b.requirements as Prisma.InputJsonValue;
      if (b.addons !== undefined) data.addons = b.addons as Prisma.InputJsonValue;
      if (b.isPublic !== undefined) data.isPublic = b.isPublic;
      if (b.bannerId !== undefined) {
        data.banner = b.bannerId ? { connect: { id: b.bannerId } } : { disconnect: true };
      }
      const e = await prisma.calendarEvent.update({
        where: { id: request.params.eventId },
        data,
        include: { banner: { select: { id: true, url: true } } },
      });
      await reply.status(200).send(mapEvent(e));
    },
  });

  app.delete('/api/v1/admin/events/:eventId', {
    schema: { tags: ['Admin'], summary: 'Delete marketing event', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: EventIdParam })],
    handler: async (request: FastifyRequest<{ Params: { eventId: string } }>, reply: FastifyReply) => {
      const existing = await prisma.calendarEvent.findUnique({ where: { id: request.params.eventId } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);
      await prisma.calendarEvent.delete({ where: { id: request.params.eventId } });
      await reply.status(204).send();
    },
  });

  app.patch('/api/v1/admin/events/:eventId/visibility', {
    schema: { tags: ['Admin'], summary: 'Toggle event public visibility', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: EventIdParam, body: VisibilitySchema })],
    handler: async (
      request: FastifyRequest<{ Params: { eventId: string }; Body: z.infer<typeof VisibilitySchema> }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.calendarEvent.findUnique({ where: { id: request.params.eventId } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);
      const e = await prisma.calendarEvent.update({
        where: { id: request.params.eventId },
        data: { isPublic: request.body.isPublic },
      });
      await reply.status(200).send({ id: e.id, isPublic: e.isPublic });
    },
  });

  app.post('/api/v1/admin/events/:eventId/preview-radius-email', {
    schema: {
      tags: ['Admin'],
      summary: 'Preview schools matched for radius email',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...adminGuard, validate({ params: EventIdParam, body: SendRadiusEmailBodySchema })],
    handler: async (
      request: FastifyRequest<{
        Params: z.infer<typeof EventIdParam>;
        Body: z.infer<typeof SendRadiusEmailBodySchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const event = await prisma.calendarEvent.findUnique({
        where: { id: request.params.eventId },
        select: {
          id: true,
          location: true,
        },
      });
      if (!event) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);

      const fallbackPostcode = extractPostcode(event.location);
      const centerInput = (request.body.centerPostcode ?? fallbackPostcode ?? event.location ?? '').trim();
      if (!centerInput) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Center postcode or location is required to calculate radius.',
          422,
        );
      }

      const normalizedCenterPostcode = normalizePostcode(centerInput);
      const center =
        (await geocodePostcode(normalizedCenterPostcode)) ?? (await geocodeAddress(centerInput));
      if (!center) {
        throw new AppError('VALIDATION_ERROR', 'Could not resolve the selected center postcode.', 422);
      }

      const schools = await prisma.user.findMany({
        where: {
          role: 'SCHOOL',
          schoolApprovalStatus: 'APPROVED',
          postcode: { not: null },
        },
        select: {
          email: true,
          postcode: true,
        },
      });

      const geoMap = await geocodePostcodesBulk(schools.map((school) => school.postcode ?? ''));
      const recipients: string[] = [];
      const seen = new Set<string>();
      for (const school of schools) {
        const email = school.email.trim();
        const postcode = school.postcode ? normalizePostcode(school.postcode) : '';
        if (!postcode || !email) continue;
        const geo = geoMap.get(postcode);
        if (!geo) continue;
        if (distanceKm(center.latitude, center.longitude, geo.latitude, geo.longitude) > request.body.radiusKm) {
          continue;
        }
        const dedupeKey = email.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        recipients.push(email);
      }

      await reply.status(200).send({
        data: {
          eventId: event.id,
          radiusKm: request.body.radiusKm,
          centerPostcode: normalizedCenterPostcode,
          recipients: recipients.length,
        },
      });
    },
  });

  app.post('/api/v1/admin/events/:eventId/send-radius-email', {
    schema: {
      tags: ['Admin'],
      summary: 'Send event email to approved schools within a postcode radius',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...adminGuard, validate({ params: EventIdParam, body: SendRadiusEmailBodySchema })],
    handler: async (
      request: FastifyRequest<{
        Params: z.infer<typeof EventIdParam>;
        Body: z.infer<typeof SendRadiusEmailBodySchema>;
      }>,
      reply: FastifyReply,
    ) => {
      if (!env.SMTP_HOST) {
        throw new AppError('EMAIL_NOT_CONFIGURED', 'Email service is not configured.', 500);
      }

      const event = await prisma.calendarEvent.findUnique({
        where: { id: request.params.eventId },
        select: {
          id: true,
          title: true,
          location: true,
          date: true,
          time: true,
          startDate: true,
          endDate: true,
          startTime: true,
          endTime: true,
        },
      });
      if (!event) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);

      const fallbackPostcode = extractPostcode(event.location);
      const centerInput = (request.body.centerPostcode ?? fallbackPostcode ?? event.location ?? '').trim();
      if (!centerInput) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Center postcode or location is required to calculate radius.',
          422,
        );
      }

      const normalizedCenterPostcode = normalizePostcode(centerInput);
      const center =
        (await geocodePostcode(normalizedCenterPostcode)) ?? (await geocodeAddress(centerInput));
      if (!center) {
        throw new AppError('VALIDATION_ERROR', 'Could not resolve the selected center postcode.', 422);
      }

      const schools = await prisma.user.findMany({
        where: {
          role: 'SCHOOL',
          schoolApprovalStatus: 'APPROVED',
          postcode: { not: null },
        },
        select: {
          email: true,
          postcode: true,
        },
      });

      const geoMap = await geocodePostcodesBulk(schools.map((school) => school.postcode ?? ''));
      const recipients: string[] = [];
      const seen = new Set<string>();
      for (const school of schools) {
        const email = school.email.trim();
        const postcode = school.postcode ? normalizePostcode(school.postcode) : '';
        if (!postcode || !email) continue;
        const geo = geoMap.get(postcode);
        if (!geo) continue;
        if (distanceKm(center.latitude, center.longitude, geo.latitude, geo.longitude) > request.body.radiusKm) {
          continue;
        }
        const dedupeKey = email.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        recipients.push(email);
      }

      const dateRangeLabel =
        event.startDate && event.endDate
          ? `${event.startDate.toISOString().split('T')[0]} to ${event.endDate.toISOString().split('T')[0]}`
          : event.date.toISOString().split('T')[0];
      const timeLabel =
        event.startTime && event.endTime ? `${event.startTime} - ${event.endTime}` : event.time;
      const subject = `New Event: ${event.title}`;
      const html = `
        <div>
          <p>Hello School Partner,</p>
          <p>We have a new event that may interest your school:</p>
          <table style="border-collapse: collapse;">
            <tr><td style="padding: 4px 8px 4px 0;"><strong>Event:</strong></td><td>${event.title}</td></tr>
            <tr><td style="padding: 4px 8px 4px 0;"><strong>Date:</strong></td><td>${dateRangeLabel}</td></tr>
            <tr><td style="padding: 4px 8px 4px 0;"><strong>Time:</strong></td><td>${timeLabel}</td></tr>
            <tr><td style="padding: 4px 8px 4px 0;"><strong>Location:</strong></td><td>${event.location}</td></tr>
          </table>
          <p style="margin-top: 16px;">This email was sent to approved schools within ${request.body.radiusKm} km of ${normalizedCenterPostcode}.</p>
          <p style="margin-top: 20px;">- DDivine Admin Team</p>
        </div>
      `;

      let sent = 0;
      if (recipients.length > 0) {
        const transporter = getTransporter();
        const batchSize = 50;
        for (let i = 0; i < recipients.length; i += batchSize) {
          const batch = recipients.slice(i, i + batchSize);
          await transporter.sendMail({
            from: env.EMAIL_FROM,
            to: env.EMAIL_FROM,
            bcc: batch.join(','),
            subject,
            html,
          });
          sent += batch.length;
        }
      }

      await prisma.schoolGroupEmailLog.create({
        data: {
          subject,
          message: `Event ${event.id} | radius=${request.body.radiusKm}km | center=${normalizedCenterPostcode}`,
          targetStatus: `radius-${request.body.radiusKm}km`,
          recipientsCount: recipients.length,
          sentCount: sent,
          sentByAdminId: request.user!.id,
        },
      });

      await reply.status(200).send({
        data: {
          eventId: event.id,
          radiusKm: request.body.radiusKm,
          centerPostcode: normalizedCenterPostcode,
          recipients: recipients.length,
          sent,
        },
      });
    },
  });
}

export default fp(adminEventsRoutes, { name: 'admin-events-routes' });
