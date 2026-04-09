/**
 * @file admin-sessions.routes.ts
 * @description Admin sessions management — full CRUD. Requires ADMIN role.
 * This is how admins create and manage the "events" that parents book.
 * @module src/modules/admin-sessions/admin-sessions.routes
 */
import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import {
  CreateSessionSchema,
  SessionIdParamSchema,
  UpdateSessionSchema,
} from './admin-sessions.schema.js';
import type { ICreateSession, ISessionIdParam, IUpdateSession } from './admin-sessions.schema.js';

import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';


const adminGuard = [authMiddleware, requireRole('ADMIN')];

function deriveSessionStatus(s: { isActive: boolean; date: Date }): 'upcoming' | 'active' | 'completed' | 'cancelled' {
  if (!s.isActive) return 'cancelled';
  const now = new Date();
  const dayStart = new Date(s.date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(s.date);
  dayEnd.setUTCHours(23, 59, 59, 999);
  if (now < dayStart) return 'upcoming';
  if (now <= dayEnd) return 'active';
  return 'completed';
}

const sessionResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    serviceId: { type: 'string' },
    serviceTitle: { type: 'string' },
    date: { type: 'string' },
    time: { type: 'string' },
    location: { type: 'string' },
    coach: { type: 'string' },
    coachName: { type: 'string' },
    capacity: { type: 'integer' },
    maxCapacity: { type: 'integer' },
    spotsLeft: { type: 'integer' },
    pricePence: { type: 'integer' },
    price: { type: 'number' },
    minAge: { type: 'integer' },
    maxAge: { type: 'integer' },
    minAgeYears: { type: 'integer' },
    maxAgeYears: { type: 'integer' },
    status: { type: 'string' },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string' },
  },
};

function mapAdminSessionResponse(s: {
  id: string;
  serviceId: string;
  service: { title: string };
  date: Date;
  time: string;
  location: string;
  coachName: string | null;
  maxCapacity: number;
  currentCapacity: number;
  price: Prisma.Decimal;
  minAgeYears: number;
  maxAgeYears: number;
  isActive: boolean;
  createdAt: Date;
}) {
  const pricePence = Math.round(s.price.toNumber() * 100);
  return {
    id: s.id,
    serviceId: s.serviceId,
    serviceTitle: s.service.title,
    date: s.date.toISOString().split('T')[0],
    time: s.time,
    location: s.location,
    coach: s.coachName ?? undefined,
    coachName: s.coachName ?? undefined,
    capacity: s.maxCapacity,
    maxCapacity: s.maxCapacity,
    spotsLeft: s.maxCapacity - s.currentCapacity,
    pricePence,
    price: pricePence / 100,
    minAge: s.minAgeYears,
    maxAge: s.maxAgeYears,
    minAgeYears: s.minAgeYears,
    maxAgeYears: s.maxAgeYears,
    status: deriveSessionStatus(s),
    isActive: s.isActive,
    createdAt: s.createdAt.toISOString(),
  };
}

async function adminSessionsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/sessions', {
    schema: {
      tags: ['Admin'],
      summary: 'List all sessions with optional filters',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          serviceId: { type: 'string' },
          isActive: { type: 'boolean' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: sessionResponseSchema },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
      },
    },
    preHandler: adminGuard,
    handler: async (
      request: FastifyRequest<{ Querystring: { serviceId?: string; isActive?: boolean; page?: number; pageSize?: number } }>,
      reply: FastifyReply,
    ) => {
      const { serviceId, isActive, page = 1 } = request.query;
      const pageSize = Math.min(request.query.pageSize ?? 20, 100);
      const skip = (page - 1) * pageSize;

      const where = {
        ...(serviceId && { serviceId }),
        ...(isActive !== undefined && { isActive }),
      };

      const [sessions, total] = await Promise.all([
        prisma.session.findMany({
          where,
          include: { service: true },
          skip,
          take: pageSize,
          orderBy: { date: 'desc' },
        }),
        prisma.session.count({ where }),
      ]);

      await reply.status(200).send({
        data: sessions.map(mapAdminSessionResponse),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });

  app.post('/api/v1/admin/sessions', {
    schema: {
      tags: ['Admin'],
      summary: 'Create a new session (event)',
      security: [{ BearerAuth: [] }],
      response: { 201: sessionResponseSchema },
    },
    preHandler: [...adminGuard, validate({ body: CreateSessionSchema })],
    handler: async (request: FastifyRequest<{ Body: ICreateSession }>, reply: FastifyReply) => {
      const { serviceId, date, time, location, coachName, maxCapacity, minAgeYears, maxAgeYears, price } = request.body;

      const service = await prisma.service.findUnique({ where: { id: serviceId } });
      if (!service) {
        throw new AppError('ACCOUNT_NOT_FOUND', 'Service not found.', 404);
      }

      const session = await prisma.session.create({
        data: {
          serviceId,
          date: new Date(date),
          time,
          location,
          coachName,
          maxCapacity,
          minAgeYears,
          maxAgeYears,
          price: new Prisma.Decimal(price),
        },
        include: { service: true },
      });

      await reply.status(201).send(mapAdminSessionResponse(session));
    },
  });

  app.get('/api/v1/admin/sessions/:sessionId', {
    schema: {
      tags: ['Admin'],
      summary: 'Get session detail by ID',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { sessionId: { type: 'string' } } },
      response: { 200: sessionResponseSchema },
    },
    preHandler: [...adminGuard, validate({ params: SessionIdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: ISessionIdParam }>, reply: FastifyReply) => {
      const session = await prisma.session.findUnique({
        where: { id: request.params.sessionId },
        include: { service: true },
      });
      if (!session) throw new AppError('ACCOUNT_NOT_FOUND', 'Session not found.', 404);

      await reply.status(200).send(mapAdminSessionResponse(session));
    },
  });

  app.patch('/api/v1/admin/sessions/:sessionId', {
    schema: {
      tags: ['Admin'],
      summary: 'Update a session',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { sessionId: { type: 'string' } } },
      response: { 200: sessionResponseSchema },
    },
    preHandler: [...adminGuard, validate({ body: UpdateSessionSchema, params: SessionIdParamSchema })],
    handler: async (
      request: FastifyRequest<{ Params: ISessionIdParam; Body: IUpdateSession }>,
      reply: FastifyReply,
    ) => {
      const { sessionId } = request.params;
      const { date, price, ...rest } = request.body;

      const existing = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Session not found.', 404);

      const session = await prisma.session.update({
        where: { id: sessionId },
        data: {
          ...rest,
          ...(date && { date: new Date(date) }),
          ...(price !== undefined && { price: new Prisma.Decimal(price) }),
        },
        include: { service: true },
      });

      await reply.status(200).send(mapAdminSessionResponse(session));
    },
  });

  app.delete('/api/v1/admin/sessions/:sessionId', {
    schema: {
      tags: ['Admin'],
      summary: 'Deactivate a session (soft delete — sets isActive: false)',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { sessionId: { type: 'string' } } },
      response: { 204: { type: 'null' } },
    },
    preHandler: [...adminGuard, validate({ params: SessionIdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: ISessionIdParam }>, reply: FastifyReply) => {
      const existing = await prisma.session.findUnique({ where: { id: request.params.sessionId } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Session not found.', 404);

      await prisma.session.update({
        where: { id: request.params.sessionId },
        data: { isActive: false },
      });

      await reply.status(204).send();
    },
  });
}

export default fp(adminSessionsRoutes, { name: 'admin-sessions-routes' });
