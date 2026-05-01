/**
 * @file xero.routes.ts
 * @description Xero OAuth and sync utility endpoints.
 * @module src/modules/xero/xero.routes
 */
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { env } from '@/config/env.js';
import { redis } from '@/shared/infrastructure/redis.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';

import { xeroService } from './xero.service.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];

const OAUTH_STATE_TTL_SECONDS = 300; // 5 minutes
const OAUTH_STATE_PREFIX = 'xero:oauth:state:';

async function xeroRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/xero/test', {
    schema: {
      tags: ['Xero'],
      summary: 'Validate Xero env config and return a consent URL',
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            configured: { type: 'boolean' },
            missing: { type: 'array', items: { type: 'string' } },
            scopes: { type: 'string' },
            authorizeUrl: { type: 'string' },
          },
        },
      },
    },
    handler: async () => {
      const missing: string[] = [];
      if (!env.XERO_CLIENT_ID) missing.push('XERO_CLIENT_ID');
      if (!env.XERO_CLIENT_SECRET) missing.push('XERO_CLIENT_SECRET');
      if (!env.XERO_REDIRECT_URI) missing.push('XERO_REDIRECT_URI');
      const configured = missing.length === 0;
      // State for test URL is informational only — not stored in Redis.
      const state = `xero_test_${Date.now()}`;

      return {
        ok: true,
        configured,
        missing,
        scopes: env.XERO_SCOPES,
        authorizeUrl: configured ? xeroService.buildAuthorizeUrl(state) : '',
      };
    },
  });

  app.get('/api/v1/xero/connect', {
    schema: {
      tags: ['Xero'],
      summary: 'Redirect to Xero OAuth consent',
    },
    handler: async (_request, reply) => {
      const state = randomUUID();
      // Store state in Redis with TTL so the callback can validate it.
      await redis.set(`${OAUTH_STATE_PREFIX}${state}`, '1', 'EX', OAUTH_STATE_TTL_SECONDS);
      const authorizeUrl = xeroService.buildAuthorizeUrl(state);
      await reply.redirect(authorizeUrl);
    },
  });

  app.get('/api/v1/xero/callback', {
    schema: {
      tags: ['Xero'],
      summary: 'Xero OAuth callback endpoint',
      querystring: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          state: { type: 'string' },
          error: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            tenantId: { type: 'string' },
            tenantName: { type: 'string' },
            tenantType: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as { code?: string; state?: string; error?: string };

      if (query.error) {
        await reply.status(400).send({ ok: false, message: `Xero OAuth error: ${query.error}` });
        return;
      }

      if (!query.code) {
        await reply.status(400).send({ ok: false, message: 'Missing OAuth code.' });
        return;
      }

      // CSRF: validate state matches a token we issued in /connect.
      if (!query.state) {
        await reply.status(400).send({ ok: false, message: 'Missing OAuth state parameter.' });
        return;
      }
      const storedState = await redis.get(`${OAUTH_STATE_PREFIX}${query.state}`);
      if (!storedState) {
        await reply
          .status(400)
          .send({ ok: false, message: 'Invalid or expired OAuth state. Please restart the OAuth flow.' });
        return;
      }
      // Consume the state so it cannot be replayed.
      await redis.del(`${OAUTH_STATE_PREFIX}${query.state}`);

      const result = await xeroService.handleOAuthCallback(query.code);
      await reply.status(200).send({
        ok: true,
        tenantId: result.tenantId,
        tenantName: result.tenantName,
        tenantType: result.tenantType,
      });
    },
  });

  app.get('/api/v1/xero/connections', {
    schema: {
      tags: ['Xero'],
      summary: 'List Xero tenant connections using stored token',
      security: [{ BearerAuth: [] }],
    },
    preHandler: adminGuard,
    handler: async (_request, reply) => {
      const items = await xeroService.getConnections();
      await reply.status(200).send({ ok: true, count: items.length, items });
    },
  });

  app.post('/api/v1/xero/sync/government-pending', {
    schema: {
      tags: ['Xero'],
      summary: 'Sync pending government / TFC bookings from Xero status',
      security: [{ BearerAuth: [] }],
    },
    preHandler: adminGuard,
    handler: async (_request, reply) => {
      const result = await xeroService.syncGovernmentPendingBookings();
      await reply.status(200).send({ ok: true, ...result });
    },
  });

  // ─── Session booking invoice routes ─────────────────────────────────────

  app.get('/api/v1/xero/bookings/:bookingId/invoice/pdf', {
    schema: {
      tags: ['Invoices'],
      summary: 'Download session booking invoice PDF from Xero',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { bookingId: { type: 'string' } },
      },
    },
    preHandler: [authMiddleware],
    handler: async (request, reply) => {
      const { bookingId } = request.params as { bookingId: string };
      const pdfBuffer = await xeroService.downloadInvoicePdfForBooking({
        bookingId,
        requesterUserId: request.user!.id,
        isAdmin: request.user!.role === 'ADMIN',
      });

      await reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="invoice-${bookingId}.pdf"`)
        .send(pdfBuffer);
    },
  });

  app.post('/api/v1/xero/bookings/:bookingId/invoice/email', {
    schema: {
      tags: ['Invoices'],
      summary: 'Trigger Xero to email session booking invoice',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { bookingId: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
        },
      },
    },
    preHandler: [authMiddleware],
    handler: async (request, reply) => {
      const { bookingId } = request.params as { bookingId: string };
      await xeroService.emailInvoiceForBooking({
        bookingId,
        requesterUserId: request.user!.id,
        isAdmin: request.user!.role === 'ADMIN',
      });
      await reply.status(200).send({ ok: true });
    },
  });

  // ─── Event booking invoice routes ────────────────────────────────────────

  app.get('/api/v1/xero/event-bookings/:bookingId/invoice/pdf', {
    schema: {
      tags: ['Invoices'],
      summary: 'Download event booking invoice PDF from Xero',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { bookingId: { type: 'string' } },
      },
    },
    preHandler: [authMiddleware],
    handler: async (request, reply) => {
      const { bookingId } = request.params as { bookingId: string };
      const pdfBuffer = await xeroService.downloadInvoicePdfForEventBooking({
        bookingId,
        requesterUserId: request.user!.id,
        isAdmin: request.user!.role === 'ADMIN',
      });

      await reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="event-invoice-${bookingId}.pdf"`)
        .send(pdfBuffer);
    },
  });

  app.post('/api/v1/xero/event-bookings/:bookingId/invoice/email', {
    schema: {
      tags: ['Invoices'],
      summary: 'Trigger Xero to email event booking invoice',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { bookingId: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
        },
      },
    },
    preHandler: [authMiddleware],
    handler: async (request, reply) => {
      const { bookingId } = request.params as { bookingId: string };
      await xeroService.emailInvoiceForEventBooking({
        bookingId,
        requesterUserId: request.user!.id,
        isAdmin: request.user!.role === 'ADMIN',
      });
      await reply.status(200).send({ ok: true });
    },
  });
}

export default fp(xeroRoutes, { name: 'xero-routes' });
