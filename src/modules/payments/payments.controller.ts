/**
 * @file payments.controller.ts
 * @description HTTP handlers for payment endpoints.
 * @module src/modules/payments/payments.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { paymentsService } from './payments.service.js';
import type { ICreatePaymentIntent, IPaymentIdParam } from './payments.schema.js';

export const paymentsController = {
  async createPaymentIntent(
    request: FastifyRequest<{ Body: ICreatePaymentIntent }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await paymentsService.createPaymentIntent(request.user!.id, request.body);
    await reply.status(201).send(result);
  },

  async handleWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const signature = request.headers['stripe-signature'] as string;

    if (!signature) {
      await reply.status(400).send({ error: 'Missing stripe-signature header' });
      return;
    }

    await paymentsService.handleWebhook(request.body as Buffer, signature);
    await reply.status(200).send({ received: true });
  },

  async getPaymentById(
    request: FastifyRequest<{ Params: IPaymentIdParam }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await paymentsService.getPaymentById(request.params.paymentId);
    await reply.status(200).send(result);
  },
};
