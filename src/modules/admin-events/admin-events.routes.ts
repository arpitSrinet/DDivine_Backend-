/**
 * @file admin-events.routes.ts
 * @description Admin CRUD for public marketing calendar events (separate from bookable sessions).
 * @module src/modules/admin-events/admin-events.routes
 */
import type { CalendarEventType, Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

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
}

export default fp(adminEventsRoutes, { name: 'admin-events-routes' });
