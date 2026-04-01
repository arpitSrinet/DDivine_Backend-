/**
 * @file refunds.routes.ts
 * @description Fastify route registration for refunds.
 * @module src/modules/refunds/refunds.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

import { refundsController } from './refunds.controller.js';
import { CreateRefundSchema, RefundIdParamSchema } from './refunds.schema.js';

const refundResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    paymentId: { type: 'string' },
    amount: { type: 'number' },
    reason: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
    createdAt: { type: 'string' },
  },
};

async function refundsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/refunds', {
    schema: {
      tags: ['Refunds'],
      summary: 'Issue a refund for a paid payment',
      security: [{ BearerAuth: [] }],
      body: {
        type: 'object',
        required: ['paymentId', 'amount', 'reason'],
        properties: {
          paymentId: { type: 'string' },
          amount: { type: 'number', description: 'Amount in GBP (e.g. 25.00)' },
          reason: { type: 'string' },
        },
      },
      response: { 201: refundResponseSchema },
    },
    preHandler: [authMiddleware, validate({ body: CreateRefundSchema })],
    handler: refundsController.createRefund,
  });

  app.get('/api/v1/refunds/:refundId', {
    schema: {
      tags: ['Refunds'],
      summary: 'Get refund status by ID',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { refundId: { type: 'string' } } },
      response: { 200: refundResponseSchema },
    },
    preHandler: [authMiddleware, validate({ params: RefundIdParamSchema })],
    handler: refundsController.getRefundById,
  });
}

export default fp(refundsRoutes, { name: 'refunds-routes' });
