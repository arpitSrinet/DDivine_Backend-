/**
 * @file app.ts
 * @description Creates and configures the Fastify application instance. Registers plugins, middleware, and routes.
 * @module src/app
 */
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';

import { env } from '@/config/env.js';
import adminAuthRoutes from '@/modules/admin-auth/admin-auth.routes.js';
import authRoutes from '@/modules/auth/auth.routes.js';
import bookingsRoutes from '@/modules/bookings/bookings.routes.js';
import childrenRoutes from '@/modules/children/children.routes.js';
import invoicesRoutes from '@/modules/invoices/invoices.routes.js';
import paymentsRoutes from '@/modules/payments/payments.routes.js';
import refundsRoutes from '@/modules/refunds/refunds.routes.js';
import servicesRoutes from '@/modules/services/services.routes.js';
import sessionsRoutes from '@/modules/sessions/sessions.routes.js';
import usersRoutes from '@/modules/users/users.routes.js';
import { registerPaymentHandlers } from '@/shared/events/handlers/payment.handlers.js';
import errorHandler from '@/shared/errors/errorHandler.js';
import { logger } from '@/shared/infrastructure/logger.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { redis } from '@/shared/infrastructure/redis.js';
import requestId from '@/shared/middleware/requestId.js';

export async function buildApp() {
  const app = Fastify({
    logger: false,
  });

  // --- Plugins ---
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });
  await app.register(fastifyCors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });
  await app.register(requestId);
  await app.register(errorHandler);

  // --- Swagger ---
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'DDivine Training API',
        description: 'Backend API for DDivine Training — sports coaching and wraparound childcare platform.',
        version: '1.0.0',
      },
      servers: [{ url: `http://localhost:${env.PORT}` }],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      tags: [
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'Auth', description: 'Authentication — signup, login, logout' },
        { name: 'Admin Auth', description: 'Admin authentication — separate from user auth' },
        { name: 'Users', description: 'User profile management' },
        { name: 'Children', description: 'Child profiles — parent role only' },
        { name: 'Services', description: 'Public services catalog — no auth required' },
        { name: 'Sessions', description: 'Session listing and detail with filters' },
        { name: 'Bookings', description: 'Core booking engine — create, cancel, list' },
        { name: 'Payments', description: 'Stripe payment intents, webhook handler, status' },
        { name: 'Invoices', description: 'Invoices — auto-created on payment success' },
        { name: 'Refunds', description: 'Refund processing against paid payments' },
      ],
    },
  });
  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });

  // --- Request/response logging ---
  app.addHook('onRequest', async (request) => {
    request.startTime = Date.now();
  });

  app.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - (request.startTime ?? Date.now());
    logger.info(
      {
        requestId: request.headers['x-request-id'],
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: duration,
      },
      'Request completed',
    );
  });

  // --- Module routes ---
  await app.register(authRoutes);
  await app.register(adminAuthRoutes);
  await app.register(usersRoutes);
  await app.register(childrenRoutes);
  await app.register(servicesRoutes);
  await app.register(sessionsRoutes);
  await app.register(bookingsRoutes);
  await app.register(paymentsRoutes);
  await app.register(invoicesRoutes);
  await app.register(refundsRoutes);

  // --- Register event handlers ---
  registerPaymentHandlers();

  // --- Health routes ---
  app.get('/api/v1/health', {
    schema: {
      tags: ['Health'],
      summary: 'Liveness probe',
      response: { 200: { type: 'object', properties: { status: { type: 'string' } } } },
    },
    handler: async () => {
      return { status: 'ok' };
    },
  });

  app.get('/api/v1/health/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness probe — checks DB and Redis',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            db: { type: 'string' },
            redis: { type: 'string' },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      let dbStatus = 'ok';
      let redisStatus = 'ok';

      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        dbStatus = 'down';
      }

      try {
        await redis.ping();
      } catch {
        redisStatus = 'down';
      }

      const isHealthy = dbStatus === 'ok' && redisStatus === 'ok';

      await reply.status(isHealthy ? 200 : 503).send({
        status: isHealthy ? 'ready' : 'degraded',
        db: dbStatus,
        redis: redisStatus,
      });
    },
  });

  return app;
}

declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number;
  }
}
