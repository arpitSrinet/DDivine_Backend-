/**
 * @file admin-event-slots.routes.ts
 * @description Admin CRUD for event dates and bookable slots.
 * @module src/modules/admin-events/admin-event-slots.routes
 */
import type { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];

// ─── Params ───────────────────────────────────────────────────────────────────

const EventIdParam = z.object({ eventId: z.string().min(1) });
const DateIdParam = z.object({ eventId: z.string().min(1), dateId: z.string().min(1) });
const SlotIdParam = z.object({
  eventId: z.string().min(1),
  dateId: z.string().min(1),
  slotId: z.string().min(1),
});

// ─── Body schemas ─────────────────────────────────────────────────────────────

const CreateDateSchema = z.object({
  date: z.string().min(1, 'Date is required (YYYY-MM-DD)'),
  isClosed: z.boolean().default(false),
});

const UpdateDateSchema = CreateDateSchema.partial();

const CreateSlotSchema = z.object({
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:mm'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'endTime must be HH:mm'),
  capacity: z.number().int().positive(),
  price: z.number().nonnegative().default(0),
  serviceFee: z.number().nonnegative().default(0),
  minAgeYears: z.number().int().nonnegative().optional(),
  maxAgeYears: z.number().int().nonnegative().optional(),
  isActive: z.boolean().default(true),
});

const UpdateSlotSchema = CreateSlotSchema.partial();

// ─── Mappers ──────────────────────────────────────────────────────────────────

function toDecimal(v: Prisma.Decimal | number): number {
  return typeof v === 'number' ? v : v.toNumber();
}

function mapSlot(s: {
  id: string;
  eventDateId: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  minAgeYears: number | null;
  maxAgeYears: number | null;
  price: Prisma.Decimal | number;
  serviceFee: Prisma.Decimal | number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: s.id,
    eventDateId: s.eventDateId,
    startTime: s.startTime,
    endTime: s.endTime,
    capacity: s.capacity,
    bookedCount: s.bookedCount,
    availableSpots: Math.max(0, s.capacity - s.bookedCount),
    isSoldOut: s.bookedCount >= s.capacity,
    minAgeYears: s.minAgeYears ?? undefined,
    maxAgeYears: s.maxAgeYears ?? undefined,
    price: toDecimal(s.price),
    serviceFee: toDecimal(s.serviceFee),
    isActive: s.isActive,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

function mapDate(d: {
  id: string;
  eventId: string;
  date: Date;
  isClosed: boolean;
  createdAt: Date;
  updatedAt: Date;
  slots?: Parameters<typeof mapSlot>[0][];
}) {
  return {
    id: d.id,
    eventId: d.eventId,
    date: d.date.toISOString().split('T')[0],
    isClosed: d.isClosed,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    ...(d.slots !== undefined ? { slots: d.slots.map(mapSlot) } : {}),
  };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function adminEventSlotsRoutes(app: FastifyInstance): Promise<void> {
  // ── Dates ───────────────────────────────────────────────────────────────────

  app.get('/api/v:version(1|2)/admin/events/:eventId/dates', {
    schema: {
      tags: ['Admin'],
      summary: 'List dates for an event',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { eventId: { type: 'string' } } },
    },
    preHandler: [...adminGuard, validate({ params: EventIdParam })],
    handler: async (
      request: FastifyRequest<{ Params: { eventId: string } }>,
      reply: FastifyReply,
    ) => {
      const event = await prisma.calendarEvent.findUnique({
        where: { id: request.params.eventId },
        select: { id: true },
      });
      if (!event) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);

      const dates = await prisma.calendarEventDate.findMany({
        where: { eventId: event.id },
        orderBy: { date: 'asc' },
        include: { slots: { orderBy: { startTime: 'asc' } } },
      });

      await reply.status(200).send({ data: dates.map(mapDate) });
    },
  });

  app.post('/api/v:version(1|2)/admin/events/:eventId/dates', {
    schema: {
      tags: ['Admin'],
      summary: 'Create a date for an event',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { eventId: { type: 'string' } } },
    },
    preHandler: [...adminGuard, validate({ params: EventIdParam, body: CreateDateSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: { eventId: string };
        Body: z.infer<typeof CreateDateSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const event = await prisma.calendarEvent.findUnique({
        where: { id: request.params.eventId },
        select: { id: true },
      });
      if (!event) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);

      const existing = await prisma.calendarEventDate.findUnique({
        where: {
          eventId_date: {
            eventId: event.id,
            date: new Date(request.body.date),
          },
        },
      });
      if (existing) {
        throw new AppError('VALIDATION_ERROR', 'This date already exists for the event.', 409);
      }

      const date = await prisma.calendarEventDate.create({
        data: {
          eventId: event.id,
          date: new Date(request.body.date),
          isClosed: request.body.isClosed,
        },
        include: { slots: true },
      });

      await reply.status(201).send(mapDate(date));
    },
  });

  app.patch('/api/v:version(1|2)/admin/events/:eventId/dates/:dateId', {
    schema: {
      tags: ['Admin'],
      summary: 'Update an event date',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { eventId: { type: 'string' }, dateId: { type: 'string' } },
      },
    },
    preHandler: [...adminGuard, validate({ params: DateIdParam, body: UpdateDateSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: { eventId: string; dateId: string };
        Body: z.infer<typeof UpdateDateSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.calendarEventDate.findFirst({
        where: { id: request.params.dateId, eventId: request.params.eventId },
      });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Date not found.', 404);

      const data: Prisma.CalendarEventDateUpdateInput = {};
      if (request.body.date !== undefined) data.date = new Date(request.body.date);
      if (request.body.isClosed !== undefined) data.isClosed = request.body.isClosed;

      const updated = await prisma.calendarEventDate.update({
        where: { id: existing.id },
        data,
        include: { slots: { orderBy: { startTime: 'asc' } } },
      });

      await reply.status(200).send(mapDate(updated));
    },
  });

  app.delete('/api/v:version(1|2)/admin/events/:eventId/dates/:dateId', {
    schema: {
      tags: ['Admin'],
      summary: 'Delete an event date and all its slots',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { eventId: { type: 'string' }, dateId: { type: 'string' } },
      },
    },
    preHandler: [...adminGuard, validate({ params: DateIdParam })],
    handler: async (
      request: FastifyRequest<{ Params: { eventId: string; dateId: string } }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.calendarEventDate.findFirst({
        where: { id: request.params.dateId, eventId: request.params.eventId },
      });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Date not found.', 404);

      await prisma.calendarEventDate.delete({ where: { id: existing.id } });
      await reply.status(204).send();
    },
  });

  // ── Slots ───────────────────────────────────────────────────────────────────

  app.get('/api/v:version(1|2)/admin/events/:eventId/dates/:dateId/slots', {
    schema: {
      tags: ['Admin'],
      summary: 'List slots for an event date',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { eventId: { type: 'string' }, dateId: { type: 'string' } },
      },
    },
    preHandler: [...adminGuard, validate({ params: DateIdParam })],
    handler: async (
      request: FastifyRequest<{ Params: { eventId: string; dateId: string } }>,
      reply: FastifyReply,
    ) => {
      const date = await prisma.calendarEventDate.findFirst({
        where: { id: request.params.dateId, eventId: request.params.eventId },
        include: { slots: { orderBy: { startTime: 'asc' } } },
      });
      if (!date) throw new AppError('ACCOUNT_NOT_FOUND', 'Date not found.', 404);

      await reply.status(200).send({ data: date.slots.map(mapSlot) });
    },
  });

  app.post('/api/v:version(1|2)/admin/events/:eventId/dates/:dateId/slots', {
    schema: {
      tags: ['Admin'],
      summary: 'Create a slot for an event date',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { eventId: { type: 'string' }, dateId: { type: 'string' } },
      },
    },
    preHandler: [...adminGuard, validate({ params: DateIdParam, body: CreateSlotSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: { eventId: string; dateId: string };
        Body: z.infer<typeof CreateSlotSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const date = await prisma.calendarEventDate.findFirst({
        where: { id: request.params.dateId, eventId: request.params.eventId },
        select: { id: true },
      });
      if (!date) throw new AppError('ACCOUNT_NOT_FOUND', 'Date not found.', 404);

      const { startTime, endTime, capacity, price, serviceFee, minAgeYears, maxAgeYears, isActive } =
        request.body;

      if (startTime >= endTime) {
        throw new AppError('VALIDATION_ERROR', 'startTime must be before endTime.', 422);
      }

      const existing = await prisma.calendarEventSlot.findUnique({
        where: {
          eventDateId_startTime_endTime: {
            eventDateId: date.id,
            startTime,
            endTime,
          },
        },
      });
      if (existing) {
        throw new AppError('VALIDATION_ERROR', 'A slot with this time range already exists for this date.', 409);
      }

      const slot = await prisma.calendarEventSlot.create({
        data: {
          eventDateId: date.id,
          startTime,
          endTime,
          capacity,
          price,
          serviceFee,
          minAgeYears,
          maxAgeYears,
          isActive,
        },
      });

      await reply.status(201).send(mapSlot(slot));
    },
  });

  app.patch('/api/v:version(1|2)/admin/events/:eventId/dates/:dateId/slots/:slotId', {
    schema: {
      tags: ['Admin'],
      summary: 'Update a slot',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          dateId: { type: 'string' },
          slotId: { type: 'string' },
        },
      },
    },
    preHandler: [...adminGuard, validate({ params: SlotIdParam, body: UpdateSlotSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: { eventId: string; dateId: string; slotId: string };
        Body: z.infer<typeof UpdateSlotSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.calendarEventSlot.findFirst({
        where: {
          id: request.params.slotId,
          eventDateId: request.params.dateId,
          eventDate: { eventId: request.params.eventId },
        },
      });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Slot not found.', 404);

      const b = request.body;
      const data: Prisma.CalendarEventSlotUpdateInput = {};
      if (b.startTime !== undefined) data.startTime = b.startTime;
      if (b.endTime !== undefined) data.endTime = b.endTime;
      if (b.capacity !== undefined) {
        if (b.capacity < existing.bookedCount) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Capacity cannot be set below current booked count (${existing.bookedCount}).`,
            422,
          );
        }
        data.capacity = b.capacity;
      }
      if (b.price !== undefined) data.price = b.price;
      if (b.serviceFee !== undefined) data.serviceFee = b.serviceFee;
      if (b.minAgeYears !== undefined) data.minAgeYears = b.minAgeYears;
      if (b.maxAgeYears !== undefined) data.maxAgeYears = b.maxAgeYears;
      if (b.isActive !== undefined) data.isActive = b.isActive;

      const updated = await prisma.calendarEventSlot.update({
        where: { id: existing.id },
        data,
      });

      await reply.status(200).send(mapSlot(updated));
    },
  });

  app.delete('/api/v:version(1|2)/admin/events/:eventId/dates/:dateId/slots/:slotId', {
    schema: {
      tags: ['Admin'],
      summary: 'Delete a slot',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          dateId: { type: 'string' },
          slotId: { type: 'string' },
        },
      },
    },
    preHandler: [...adminGuard, validate({ params: SlotIdParam })],
    handler: async (
      request: FastifyRequest<{ Params: { eventId: string; dateId: string; slotId: string } }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.calendarEventSlot.findFirst({
        where: {
          id: request.params.slotId,
          eventDateId: request.params.dateId,
          eventDate: { eventId: request.params.eventId },
        },
        select: { id: true, bookedCount: true },
      });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Slot not found.', 404);

      if (existing.bookedCount > 0) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Cannot delete a slot that has active bookings.',
          409,
        );
      }

      await prisma.calendarEventSlot.delete({ where: { id: existing.id } });
      await reply.status(204).send();
    },
  });
}

export default fp(adminEventSlotsRoutes, { name: 'admin-event-slots-routes' });
