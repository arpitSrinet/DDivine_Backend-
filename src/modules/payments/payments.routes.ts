/**
 * @file payments.routes.ts
 * @description Fastify route registration for payments.
 * The webhook route uses a scoped raw body parser so Stripe signature verification works.
 * @module src/modules/payments/payments.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

import { paymentsController } from './payments.controller.js';
import { CreatePaymentIntentSchema, PaymentIdParamSchema } from './payments.schema.js';

const paymentResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    bookingId: { type: 'string' },
    amount: { type: 'number' },
    currency: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'paid', 'refunded', 'failed'] },
    stripePaymentIntentId: { type: 'string' },
  },
};

async function paymentsRoutes(app: FastifyInstance): Promise<void> {
  // --- Standard JSON routes ---
  app.post('/api/v1/payments/create-intent', {
    schema: {
      tags: ['Payments'],
      summary: 'Create a Stripe PaymentIntent for a booking',
      security: [{ BearerAuth: [] }],
      body: {
        type: 'object',
        required: ['bookingId'],
        properties: { bookingId: { type: 'string' } },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            clientSecret: { type: 'string' },
            paymentId: { type: 'string' },
            amount: { type: 'number', description: 'Amount in pence (GBP)' },
            currency: { type: 'string' },
          },
        },
      },
    },
    preHandler: [authMiddleware, validate({ body: CreatePaymentIntentSchema })],
    handler: paymentsController.createPaymentIntent,
  });

  app.get('/api/v1/payments/:paymentId', {
    schema: {
      tags: ['Payments'],
      summary: 'Get payment status by ID',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { paymentId: { type: 'string' } } },
      response: { 200: paymentResponseSchema },
    },
    preHandler: [authMiddleware, validate({ params: PaymentIdParamSchema })],
    handler: paymentsController.getPaymentById,
  });

  // --- Webhook route with raw body parser (scoped so it doesn't affect other routes) ---
  await app.register(async (webhookScope) => {
    webhookScope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => {
        done(null, body);
      },
    );

    webhookScope.post('/api/v1/payments/webhook', {
      schema: {
        tags: ['Payments'],
        summary: 'Stripe webhook handler — do not call manually',
        response: {
          200: { type: 'object', properties: { received: { type: 'boolean' } } },
        },
      },
      handler: paymentsController.handleWebhook,
    });
  });
}

export default fp(paymentsRoutes, { name: 'payments-routes' });
