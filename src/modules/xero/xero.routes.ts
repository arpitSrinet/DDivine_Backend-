/**
 * @file xero.routes.ts
 * @description Xero OAuth and sync utility endpoints.
 * @module src/modules/xero/xero.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { env } from '@/config/env.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';

import { xeroService } from './xero.service.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];

async function xeroRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/xero/test', {
    schema: {
      tags: ['Health'],
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
      tags: ['Health'],
      summary: 'Redirect to Xero OAuth consent',
    },
    handler: async (_request, reply) => {
      const state = `xero_connect_${Date.now()}`;
      const authorizeUrl = xeroService.buildAuthorizeUrl(state);
      await reply.redirect(authorizeUrl);
    },
  });

  app.get('/api/v1/xero/callback', {
    schema: {
      tags: ['Health'],
      summary: 'Xero OAuth callback endpoint',
      querystring: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          state: { type: 'string' },
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
      const query = request.query as { code?: string };
      if (!query.code) {
        await reply.status(400).send({ ok: false, message: 'Missing OAuth code.' });
        return;
      }

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
      tags: ['Health'],
      summary: 'List Xero tenant connections using stored token',
    },
    preHandler: adminGuard,
    handler: async (_request, reply) => {
      const items = await xeroService.getConnections();
      await reply.status(200).send({ ok: true, count: items.length, items });
    },
  });

  app.post('/api/v1/xero/sync/government-pending', {
    schema: {
      tags: ['Health'],
      summary: 'Sync pending government bookings from Xero status',
    },
    preHandler: adminGuard,
    handler: async (_request, reply) => {
      const result = await xeroService.syncGovernmentPendingBookings();
      await reply.status(200).send({ ok: true, ...result });
    },
  });

  app.get('/api/v1/xero/bookings/:bookingId/invoice/pdf', {
    schema: {
      tags: ['Invoices'],
      summary: 'Download booking invoice PDF from Xero',
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
      summary: 'Trigger Xero to email booking invoice',
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
}

export default fp(xeroRoutes, { name: 'xero-routes' });
