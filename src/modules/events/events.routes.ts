/**
 * @file events.routes.ts
 * @description Public event listing and authenticated user bookings.
 * @module src/modules/events/events.routes
 */
import type { CalendarEventType, Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { optionalAuthMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

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

const EventIdParamSchema = z.object({
  eventId: z.string().min(1),
});

const EventFilterSchema = z.object({
  type: z.enum(['tournament', 'open-day', 'camp', 'school-visit', 'other']).optional(),
  date: z.string().date().optional(),
  location: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(20).transform((v) => Math.min(v, 100)),
});

const CreateEventBookingSchema = z.object({
  childId: z.string().min(1).optional(),
  notes: z.string().max(1000).optional(),
});

const parentGuard = [authMiddleware, requireRole('PARENT')];

function toDateOnly(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString().split('T')[0] : undefined;
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
    date: toDateOnly(e.date),
    time: e.time,
    startDate: toDateOnly(e.startDate ?? e.date),
    endDate: toDateOnly(e.endDate ?? e.startDate ?? e.date),
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

async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/events', {
    schema: {
      tags: ['Events'],
      summary: 'List public events',
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          location: { type: 'string' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
    },
    preHandler: [optionalAuthMiddleware, validate({ query: EventFilterSchema })],
    handler: async (
      request: FastifyRequest<{
        Querystring: z.infer<typeof EventFilterSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const { type, date, location, page, pageSize } = request.query;
      const skip = (page - 1) * pageSize;
      const prismaType = type ? API_TO_TYPE[type] : undefined;
      const where = {
        isPublic: true,
        ...(prismaType && { type: prismaType }),
        ...(date && { date: new Date(date) }),
        ...(location && { location: { contains: location, mode: 'insensitive' as const } }),
      };

      const [rows, total] = await Promise.all([
        prisma.calendarEvent.findMany({
          where,
          include: { banner: { select: { id: true, url: true } } },
          skip,
          take: pageSize,
          orderBy: [{ date: 'asc' }, { createdAt: 'desc' }],
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

  app.get('/api/v1/events/:eventId', {
    schema: {
      tags: ['Events'],
      summary: 'Get public event details',
      params: { type: 'object', properties: { eventId: { type: 'string' } } },
    },
    preHandler: [optionalAuthMiddleware, validate({ params: EventIdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: { eventId: string } }>, reply: FastifyReply) => {
      const event = await prisma.calendarEvent.findFirst({
        where: { id: request.params.eventId, isPublic: true },
        include: { banner: { select: { id: true, url: true } } },
      });
      if (!event) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);
      await reply.status(200).send(mapEvent(event));
    },
  });

  app.get('/api/v1/events/bookings/mine', {
    schema: {
      tags: ['Events'],
      summary: 'Get current user event bookings',
      security: [{ BearerAuth: [] }],
    },
    preHandler: parentGuard,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const rows = await prisma.calendarEventBooking.findMany({
        where: { userId },
        include: {
          event: { include: { banner: { select: { id: true, url: true } } } },
          child: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      await reply.status(200).send(
        rows.map((row) => ({
          id: row.id,
          notes: row.notes ?? undefined,
          createdAt: row.createdAt.toISOString(),
          child: row.child
            ? {
                id: row.child.id,
                firstName: row.child.firstName,
                lastName: row.child.lastName,
              }
            : undefined,
          event: mapEvent(row.event),
        })),
      );
    },
  });

  app.post('/api/v1/events/:eventId/book', {
    schema: {
      tags: ['Events'],
      summary: 'Book a public event as the authenticated user',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { eventId: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          childId: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
    preHandler: [...parentGuard, validate({ params: EventIdParamSchema, body: CreateEventBookingSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: { eventId: string };
        Body: z.infer<typeof CreateEventBookingSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user!.id;
      const { eventId } = request.params;
      const { childId, notes } = request.body;

      if (childId) {
        const child = await prisma.child.findFirst({
          where: { id: childId, userId },
          select: { id: true },
        });
        if (!child) throw new AppError('ACCOUNT_NOT_FOUND', 'Child not found.', 404);
      }

      // Run capacity check + booking creation atomically
      const { booking, event } = await prisma.$transaction(async (tx) => {
        const ev = await tx.calendarEvent.findFirst({
          where: { id: eventId, isPublic: true },
          include: { banner: { select: { id: true, url: true } } },
        });
        if (!ev) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);

        if (ev.maxCapacity !== null) {
          const available = ev.maxCapacity - ev.currentCapacity;
          if (available <= 0) {
            throw new AppError('EVENT_FULL', 'This event is fully booked.', 409);
          }
        }

        const duplicate = await tx.calendarEventBooking.findFirst({
          where: { eventId, userId, ...(childId ? { childId } : { childId: null }) },
          select: { id: true },
        });
        if (duplicate) {
          throw new AppError('VALIDATION_ERROR', 'You have already booked this event.', 409);
        }

        const b = await tx.calendarEventBooking.create({
          data: { eventId, userId, childId, notes },
        });

        if (ev.maxCapacity !== null) {
          await tx.calendarEvent.update({
            where: { id: eventId },
            data: { currentCapacity: { increment: 1 } },
          });
        }

        return { booking: b, event: ev };
      });

      await reply.status(201).send({
        id: booking.id,
        event: mapEvent(event),
        childId: booking.childId ?? undefined,
        notes: booking.notes ?? undefined,
        createdAt: booking.createdAt.toISOString(),
      });
    },
  });
}

export default fp(eventsRoutes, { name: 'events-routes' });
