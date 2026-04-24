/**
 * @file app.ts
 * @description Creates and configures the Fastify application instance. Registers plugins, middleware, and routes.
 * @module src/app
 */
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { env } from '@/config/env.js';
import adminAuthRoutes from '@/modules/admin-auth/admin-auth.routes.js';
import uploadsRoutes from '@/modules/uploads/uploads.routes.js';
import adminBookingsRoutes from '@/modules/admin-bookings/admin-bookings.routes.js';
import adminChildrenRoutes from '@/modules/admin-children/admin-children.routes.js';
import adminContactRoutes from '@/modules/admin-contact/admin-contact.routes.js';
import adminContentRoutes from '@/modules/admin-content/admin-content.routes.js';
import adminCustomersRoutes from '@/modules/admin-customers/admin-customers.routes.js';
import adminDashboardRoutes from '@/modules/admin-dashboard/admin-dashboard.routes.js';
import adminEventsRoutes from '@/modules/admin-events/admin-events.routes.js';
import adminEventSlotsRoutes from '@/modules/admin-events/admin-event-slots.routes.js';
import adminLeagueGameRequestsRoutes from '@/modules/admin-league-game-requests/admin-league-game-requests.routes.js';
import adminKnowledgeRoutes from '@/modules/admin-knowledge/admin-knowledge.routes.js';
import adminMediaRoutes from '@/modules/admin-media/admin-media.routes.js';
import adminPaymentsRoutes from '@/modules/admin-payments/admin-payments.routes.js';
import adminRefundsRoutes from '@/modules/admin-refunds/admin-refunds.routes.js';
import adminRolesRoutes from '@/modules/admin-roles/admin-roles.routes.js';
import adminScoresRoutes from '@/modules/admin-scores/admin-scores.routes.js';
import adminServicesRoutes from '@/modules/admin-services/admin-services.routes.js';
import adminSessionsRoutes from '@/modules/admin-sessions/admin-sessions.routes.js';
import authRoutes from '@/modules/auth/auth.routes.js';
import bookingsRoutes from '@/modules/bookings/bookings.routes.js';
import childrenRoutes from '@/modules/children/children.routes.js';
import contactRoutes from '@/modules/contact/contact.routes.js';
import eventBookingsRoutes from '@/modules/event-bookings/event-bookings.routes.js';
import eventBookingsV2Routes from '@/modules/event-bookings/event-bookings-v2.routes.js';
import invoicesRoutes from '@/modules/invoices/invoices.routes.js';
import { emailQueue } from '@/modules/jobs/queues/email.queue.js';
import { invoiceQueue } from '@/modules/jobs/queues/invoice.queue.js';
import { startEmailWorker } from '@/modules/jobs/workers/email.worker.js';
import { startInvoiceWorker } from '@/modules/jobs/workers/invoice.worker.js';
import eventsRoutes from '@/modules/events/events.routes.js';
import eventsV2Routes from '@/modules/events/events-v2.routes.js';
import knowledgeRoutes from '@/modules/knowledge/knowledge.routes.js';
import leagueRoutes from '@/modules/league/league.routes.js';
import notificationsRoutes from '@/modules/notifications/notifications.routes.js';
import paymentsRoutes from '@/modules/payments/payments.routes.js';
import refundsRoutes from '@/modules/refunds/refunds.routes.js';
import schoolsRoutes from '@/modules/schools/schools.routes.js';
import servicesRoutes from '@/modules/services/services.routes.js';
import sessionsRoutes from '@/modules/sessions/sessions.routes.js';
import usersRoutes from '@/modules/users/users.routes.js';
import xeroRoutes from '@/modules/xero/xero.routes.js';
import errorHandler from '@/shared/errors/errorHandler.js';
import { registerPaymentHandlers } from '@/shared/events/handlers/payment.handlers.js';
import { logger } from '@/shared/infrastructure/logger.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { redis } from '@/shared/infrastructure/redis.js';
import requestId from '@/shared/middleware/requestId.js';
import { xeroService } from '@/modules/xero/xero.service.js';

type CompatibleBullBoardQueueAdapter = NonNullable<
  Parameters<typeof createBullBoard>[0]['queues']
>[number];

export async function buildApp() {
  const app = Fastify({
    logger: false,
  });

  const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, '');
  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

  // --- Plugins ---
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      // Non-browser clients (curl/postman) may omit Origin; allow them.
      if (!origin) return cb(null, true);

      const normalized = normalizeOrigin(origin);
      const isAllowed = allowedOrigins.includes(normalized);
      return cb(null, isAllowed);
    },
    credentials: true,
  });
  await app.register(requestId);
  await app.register(errorHandler);

  // --- File uploads ---
  const uploadsDir = resolve(process.cwd(), env.UPLOADS_DIR);
  mkdirSync(uploadsDir, { recursive: true });

  await app.register(fastifyMultipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 25 },
  });
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // --- Swagger ---
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'DDivine Training API',
        description: 'Backend API for DDivine Training — sports coaching and wraparound childcare platform.',
        version: '1.0.0',
      },
      servers: [{ url: env.BASE_URL }],
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
        { name: 'Notifications', description: 'User notifications — read and mark as read' },
        { name: 'League', description: 'Public league table and match results' },
        { name: 'Contact', description: 'Public contact form' },
        { name: 'Knowledge', description: 'Public content — case studies, free activities, FAQs' },
        { name: 'Events', description: 'Public marketing events and user event bookings' },
        { name: 'Event Bookings', description: 'Multi-step event booking flow, checkout, and receipts' },
        { name: 'Schools', description: 'School profile management' },
        { name: 'Admin', description: 'Admin system — requires ADMIN role' },
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

  // --- Bull Board (queue monitoring UI) ---
  const serverAdapter = new FastifyAdapter();
  createBullBoard({
    // Bull Board v5 typings are stricter than BullMQ v5 job typings (progress union),
    // but runtime compatibility is fine for queue monitoring.
    queues: [
      new BullMQAdapter(emailQueue) as unknown as CompatibleBullBoardQueueAdapter,
      new BullMQAdapter(invoiceQueue) as unknown as CompatibleBullBoardQueueAdapter,
    ],
    serverAdapter,
  });
  const bullBoardBasePath = '/admin/queues';
  serverAdapter.setBasePath(bullBoardBasePath);
  await app.register(serverAdapter.registerPlugin(), { basePath: bullBoardBasePath });

  // --- Module routes ---
  await app.register(authRoutes);
  await app.register(uploadsRoutes);
  await app.register(adminAuthRoutes);
  await app.register(usersRoutes);
  await app.register(childrenRoutes);
  await app.register(servicesRoutes);
  await app.register(sessionsRoutes);
  await app.register(eventBookingsRoutes);
  await app.register(eventBookingsV2Routes);
  await app.register(bookingsRoutes);
  await app.register(paymentsRoutes);
  await app.register(invoicesRoutes);
  await app.register(refundsRoutes);
  await app.register(notificationsRoutes);
  await app.register(leagueRoutes);
  await app.register(knowledgeRoutes);
  await app.register(eventsRoutes);
  await app.register(eventsV2Routes);
  await app.register(schoolsRoutes);
  await app.register(adminDashboardRoutes);
  await app.register(adminSessionsRoutes);
  await app.register(adminBookingsRoutes);
  await app.register(adminPaymentsRoutes);
  await app.register(adminRefundsRoutes);
  await app.register(adminKnowledgeRoutes);
  await app.register(adminServicesRoutes);
  await app.register(adminCustomersRoutes);
  await app.register(adminChildrenRoutes);
  await app.register(adminEventsRoutes);
  await app.register(adminEventSlotsRoutes);
  await app.register(adminMediaRoutes);
  await app.register(adminContactRoutes);
  await app.register(adminContentRoutes);
  await app.register(adminScoresRoutes);
  await app.register(adminLeagueGameRequestsRoutes);
  await app.register(adminRolesRoutes);
  await app.register(contactRoutes);
  await app.register(xeroRoutes);

  // --- Register event handlers (Phase 6: BullMQ workers also started here) ---
  registerPaymentHandlers();
  startEmailWorker();
  startInvoiceWorker();

  // --- Optional: poll Xero to sync government payment invoices ---
  const xeroPollSeconds = env.XERO_GOV_SYNC_INTERVAL_SECONDS ?? 0;
  if (xeroPollSeconds > 0) {
    setInterval(async () => {
      try {
        const result = await xeroService.syncGovernmentPendingBookings();
        if (result.synced > 0) {
          logger.info({ synced: result.synced }, 'Xero government booking sync completed');
        }
      } catch (err) {
        logger.error({ err }, 'Xero government booking sync failed');
      }
    }, xeroPollSeconds * 1000);
  }

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
