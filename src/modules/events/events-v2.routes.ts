/**
 * @file events-v2.routes.ts
 * @description V2 public event routes — events with structured dates and bookable slots.
 * @module src/modules/events/events-v2.routes
 */
import type { CalendarEventType } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { optionalAuthMiddleware } from '@/shared/middleware/auth.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

const TYPE_TO_API: Record<CalendarEventType, string> = {
  TOURNAMENT: 'tournament',
  OPEN_DAY: 'open-day',
  CAMP: 'camp',
  SCHOOL_VISIT: 'school-visit',
  OTHER: 'other',
};

const API_TO_TYPE: Record<string, CalendarEventType> = {
  tournament: 'TOURNAMENT',
  'open-day': 'OPEN_DAY',
  camp: 'CAMP',
  'school-visit': 'SCHOOL_VISIT',
  other: 'OTHER',
};

const EventIdParam = z.object({ eventId: z.string().min(1) });
const DateIdParam = z.object({ eventId: z.string().min(1), dateId: z.string().min(1) });

const EventListQuerySchema = z.object({
  type: z.enum(['tournament', 'open-day', 'camp', 'school-visit', 'other']).optional(),
  location: z.string().optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(20).transform((v) => Math.min(v, 100)),
});

function toDateOnly(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString().split('T')[0] : undefined;
}

function toDecimalNumber(value: { toNumber(): number } | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

function mapSlot(slot: {
  id: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  minAgeYears: number | null;
  maxAgeYears: number | null;
  price: { toNumber(): number } | number;
  serviceFee: { toNumber(): number } | number;
  isActive: boolean;
}) {
  const availableSpots = Math.max(0, slot.capacity - slot.bookedCount);
  return {
    id: slot.id,
    startTime: slot.startTime,
    endTime: slot.endTime,
    capacity: slot.capacity,
    bookedCount: slot.bookedCount,
    availableSpots,
    isSoldOut: availableSpots === 0,
    minAgeYears: slot.minAgeYears ?? undefined,
    maxAgeYears: slot.maxAgeYears ?? undefined,
    price: toDecimalNumber(slot.price),
    serviceFee: toDecimalNumber(slot.serviceFee),
    isActive: slot.isActive,
  };
}

function mapDate(d: {
  id: string;
  date: Date;
  isClosed: boolean;
  slots: Parameters<typeof mapSlot>[0][];
}) {
  return {
    id: d.id,
    date: toDateOnly(d.date)!,
    isClosed: d.isClosed,
    slots: d.slots.filter((s) => s.isActive).map(mapSlot),
  };
}

function mapEventSummary(e: {
  id: string;
  title: string;
  description: string | null;
  type: CalendarEventType;
  category: string | null;
  location: string;
  currency: string;
  isPublic: boolean;
  banner: { url: string } | null;
  dates: { date: Date; isClosed: boolean; slots: { bookedCount: number; capacity: number; isActive: boolean }[] }[];
}) {
  const futureDates = e.dates
    .filter((d) => !d.isClosed)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const nextDate = futureDates[0] ? toDateOnly(futureDates[0].date) : undefined;
  const totalSlots = e.dates.reduce((acc, d) => acc + d.slots.filter((s) => s.isActive).length, 0);
  const totalAvailableSpots = e.dates.reduce(
    (acc, d) => acc + d.slots.filter((s) => s.isActive).reduce((s, sl) => s + Math.max(0, sl.capacity - sl.bookedCount), 0),
    0,
  );

  // bookingFlow tells the client which booking flow to use:
  //   "v2_slots" → event has structured dates+slots, use the V2 cart/slot-picker flow
  //   "v1_simple" → event uses flat date/time fields, use the V1 single-step intent flow
  const bookingFlow = totalSlots > 0 ? 'v2_slots' : 'v1_simple';

  return {
    id: e.id,
    title: e.title,
    description: e.description ?? undefined,
    type: TYPE_TO_API[e.type],
    category: e.category ?? undefined,
    location: e.location,
    currency: e.currency,
    bookingFlow,
    nextDate,
    totalDates: e.dates.length,
    totalSlots,
    totalAvailableSpots,
    isSoldOut: totalSlots > 0 && totalAvailableSpots === 0,
    bannerUrl: e.banner?.url,
  };
}

async function eventsV2Routes(app: FastifyInstance): Promise<void> {
  // ─── GET /api/v2/events ────────────────────────────────────────────────────
  app.get('/api/v2/events', {
    schema: {
      tags: ['Events'],
      summary: '[V2] List public events with date/slot summary',
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          location: { type: 'string' },
          fromDate: { type: 'string', description: 'YYYY-MM-DD' },
          toDate: { type: 'string', description: 'YYYY-MM-DD' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
    },
    preHandler: [optionalAuthMiddleware, validate({ query: EventListQuerySchema })],
    handler: async (
      request: FastifyRequest<{ Querystring: z.infer<typeof EventListQuerySchema> }>,
      reply: FastifyReply,
    ) => {
      const { type, location, fromDate, toDate, page, pageSize } = request.query;
      const skip = (page - 1) * pageSize;
      const prismaType = type ? API_TO_TYPE[type] : undefined;

      const where = {
        isPublic: true,
        ...(prismaType && { type: prismaType }),
        ...(location && { location: { contains: location, mode: 'insensitive' as const } }),
        ...(fromDate || toDate
          ? {
              dates: {
                some: {
                  date: {
                    ...(fromDate && { gte: new Date(fromDate) }),
                    ...(toDate && { lte: new Date(toDate) }),
                  },
                },
              },
            }
          : {}),
      };

      const [rows, total] = await Promise.all([
        prisma.calendarEvent.findMany({
          where,
          include: {
            banner: { select: { url: true } },
            dates: {
              include: {
                slots: {
                  where: { isActive: true },
                  select: { bookedCount: true, capacity: true, isActive: true },
                },
              },
            },
          },
          skip,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.calendarEvent.count({ where }),
      ]);

      await reply.status(200).send({
        data: rows.map(mapEventSummary),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });

  // ─── GET /api/v2/events/:eventId ───────────────────────────────────────────
  app.get('/api/v2/events/:eventId', {
    schema: {
      tags: ['Events'],
      summary: '[V2] Get public event with all dates and bookable slots',
      params: { type: 'object', properties: { eventId: { type: 'string' } } },
    },
    preHandler: [optionalAuthMiddleware, validate({ params: EventIdParam })],
    handler: async (
      request: FastifyRequest<{ Params: { eventId: string } }>,
      reply: FastifyReply,
    ) => {
      const event = await prisma.calendarEvent.findFirst({
        where: { id: request.params.eventId, isPublic: true },
        include: {
          banner: { select: { id: true, url: true } },
          dates: {
            orderBy: { date: 'asc' },
            include: {
              slots: {
                orderBy: { startTime: 'asc' },
              },
            },
          },
        },
      });

      if (!event) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);

      const totalActiveSlots = event.dates.reduce(
        (acc, d) => acc + d.slots.filter((s) => s.isActive).length,
        0,
      );
      const bookingFlow = totalActiveSlots > 0 ? 'v2_slots' : 'v1_simple';

      await reply.status(200).send({
        id: event.id,
        title: event.title,
        description: event.description ?? undefined,
        type: TYPE_TO_API[event.type],
        category: event.category ?? undefined,
        location: event.location,
        currency: event.currency,
        minAgeYears: event.minAgeYears ?? undefined,
        maxAgeYears: event.maxAgeYears ?? undefined,
        requirements: event.requirements ?? undefined,
        addons: event.addons ?? undefined,
        isPublic: event.isPublic,
        bannerUrl: event.banner?.url,
        bannerId: event.bannerId ?? undefined,
        bookingFlow,
        createdAt: event.createdAt.toISOString(),
        updatedAt: event.updatedAt.toISOString(),
        dates: event.dates.map(mapDate),
      });
    },
  });

  // ─── GET /api/v2/events/:eventId/dates ─────────────────────────────────────
  app.get('/api/v2/events/:eventId/dates', {
    schema: {
      tags: ['Events'],
      summary: '[V2] List available dates for an event',
      params: { type: 'object', properties: { eventId: { type: 'string' } } },
    },
    preHandler: [validate({ params: EventIdParam })],
    handler: async (
      request: FastifyRequest<{ Params: { eventId: string } }>,
      reply: FastifyReply,
    ) => {
      const event = await prisma.calendarEvent.findFirst({
        where: { id: request.params.eventId, isPublic: true },
        select: { id: true },
      });
      if (!event) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);

      const dates = await prisma.calendarEventDate.findMany({
        where: { eventId: event.id },
        orderBy: { date: 'asc' },
        include: {
          slots: { where: { isActive: true }, orderBy: { startTime: 'asc' } },
        },
      });

      await reply.status(200).send({ data: dates.map(mapDate) });
    },
  });

  // ─── GET /api/v2/events/:eventId/dates/:dateId/slots ───────────────────────
  app.get('/api/v2/events/:eventId/dates/:dateId/slots', {
    schema: {
      tags: ['Events'],
      summary: '[V2] List slots for a specific event date',
      params: {
        type: 'object',
        properties: { eventId: { type: 'string' }, dateId: { type: 'string' } },
      },
    },
    preHandler: [validate({ params: DateIdParam })],
    handler: async (
      request: FastifyRequest<{ Params: { eventId: string; dateId: string } }>,
      reply: FastifyReply,
    ) => {
      const date = await prisma.calendarEventDate.findFirst({
        where: {
          id: request.params.dateId,
          eventId: request.params.eventId,
          event: { isPublic: true },
        },
        include: {
          slots: { orderBy: { startTime: 'asc' } },
        },
      });

      if (!date) throw new AppError('ACCOUNT_NOT_FOUND', 'Date not found.', 404);

      await reply.status(200).send({
        dateId: date.id,
        date: toDateOnly(date.date)!,
        isClosed: date.isClosed,
        slots: date.slots.map(mapSlot),
      });
    },
  });
}

export default fp(eventsV2Routes, { name: 'events-v2-routes' });
