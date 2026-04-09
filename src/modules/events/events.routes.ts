/**
 * @file events.routes.ts
 * @description Public event listing and authenticated user bookings.
 * @module src/modules/events/events.routes
 */
import type { CalendarEventType } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { optionalAuthMiddleware } from '@/shared/middleware/auth.middleware.js';
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

function mapEvent(e: {
  id: string;
  title: string;
  description: string | null;
  type: CalendarEventType;
  date: Date;
  time: string;
  location: string;
  bannerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  banner: { id: string; url: string } | null;
}) {
  return {
    id: e.id,
    title: e.title,
    description: e.description ?? undefined,
    type: TYPE_TO_API[e.type],
    date: e.date.toISOString().split('T')[0],
    time: e.time,
    location: e.location,
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
    preHandler: [authMiddleware],
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
    preHandler: [authMiddleware, validate({ params: EventIdParamSchema, body: CreateEventBookingSchema })],
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

      const event = await prisma.calendarEvent.findFirst({
        where: { id: eventId, isPublic: true },
        include: { banner: { select: { id: true, url: true } } },
      });
      if (!event) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);

      if (childId) {
        const child = await prisma.child.findFirst({
          where: { id: childId, userId },
          select: { id: true },
        });
        if (!child) {
          throw new AppError('ACCOUNT_NOT_FOUND', 'Child not found.', 404);
        }
      }

      const duplicate = await prisma.calendarEventBooking.findFirst({
        where: {
          eventId,
          userId,
          ...(childId ? { childId } : { childId: null }),
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new AppError('VALIDATION_ERROR', 'You have already booked this event.', 409);
      }

      const booking = await prisma.calendarEventBooking.create({
        data: {
          eventId,
          userId,
          childId,
          notes,
        },
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
