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
  date: Date;
  time: string;
  location: string;
  isPublic: boolean;
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
      const { title, type, date, time, location, description, isPublic, bannerId } = request.body;
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
