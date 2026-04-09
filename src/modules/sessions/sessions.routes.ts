/**
 * @file sessions.routes.ts
 * @description Fastify route registration for sessions. Auth is optional — unauthenticated
 * visitors may browse sessions; a Bearer token enriches the request context when provided.
 * @module src/modules/sessions/sessions.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { optionalAuthMiddleware } from '@/shared/middleware/auth.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

import { sessionsController } from './sessions.controller.js';
import { SessionFilterSchema, SessionIdParamSchema } from './sessions.schema.js';

const sessionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    serviceId: { type: 'string' },
    serviceName: { type: 'string' },
    date: { type: 'string' },
    time: { type: 'string' },
    location: { type: 'string' },
    coachName: { type: 'string' },
    maxCapacity: { type: 'integer' },
    availableSpots: { type: 'integer' },
    minAgeYears: { type: 'integer' },
    maxAgeYears: { type: 'integer' },
    price: { type: 'number' },
  },
};

async function sessionsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/sessions', {
    schema: {
      tags: ['Sessions'],
      summary: 'List sessions with optional filters — auth optional (token enriches context when sent)',
      querystring: {
        type: 'object',
        properties: {
          serviceId: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          location: { type: 'string' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: sessionSchema },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
      },
    },
    preHandler: [optionalAuthMiddleware, validate({ query: SessionFilterSchema })],
    handler: sessionsController.getSessions,
  });

  app.get('/api/v1/sessions/:sessionId', {
    schema: {
      tags: ['Sessions'],
      summary: 'Get session detail — auth optional (token enriches context when sent)',
      params: {
        type: 'object',
        properties: { sessionId: { type: 'string' } },
      },
      response: { 200: sessionSchema },
    },
    preHandler: [optionalAuthMiddleware, validate({ params: SessionIdParamSchema })],
    handler: sessionsController.getSessionById,
  });
}

export default fp(sessionsRoutes, { name: 'sessions-routes' });
