/**
 * @file refunds.controller.ts
 * @description HTTP handlers for refund endpoints.
 * @module src/modules/refunds/refunds.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { refundsService } from './refunds.service.js';
import type { ICreateRefund, IRefundIdParam } from './refunds.schema.js';

export const refundsController = {
  async createRefund(
    request: FastifyRequest<{ Body: ICreateRefund }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await refundsService.createRefund(request.body);
    await reply.status(201).send(result);
  },

  async getRefundById(
    request: FastifyRequest<{ Params: IRefundIdParam }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await refundsService.getRefundById(request.params.refundId);
    await reply.status(200).send(result);
  },
};
