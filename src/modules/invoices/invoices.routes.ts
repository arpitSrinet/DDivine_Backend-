/**
 * @file invoices.routes.ts
 * @description Fastify route registration for invoices. Read-only public endpoint.
 * @module src/modules/invoices/invoices.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

import { invoicesService } from './invoices.service.js';
import { InvoiceIdParamSchema } from './invoices.schema.js';

async function invoicesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/invoices/:invoiceId', {
    schema: {
      tags: ['Invoices'],
      summary: 'Get invoice by ID',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { invoiceId: { type: 'string' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            paymentId: { type: 'string' },
            pdfUrl: { type: 'string' },
            createdAt: { type: 'string' },
          },
        },
      },
    },
    preHandler: [authMiddleware, validate({ params: InvoiceIdParamSchema })],
    handler: async (request, reply) => {
      const { invoiceId } = request.params as { invoiceId: string };
      const result = await invoicesService.getInvoiceById(invoiceId);
      await reply.status(200).send(result);
    },
  });
}

export default fp(invoicesRoutes, { name: 'invoices-routes' });
