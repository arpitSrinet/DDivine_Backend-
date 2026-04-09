/**
 * @file admin-payments.routes.ts
 * @description Admin payments management — list, view, trigger refunds. Requires ADMIN role.
 * @module src/modules/admin-payments/admin-payments.routes
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { PAYMENT_STATUS_MAP } from '@/modules/payments/payments.schema.js';
import { refundsService } from '@/modules/refunds/refunds.service.js';
import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];
const PaymentIdParamSchema = z.object({ paymentId: z.string().min(1) });
const AdminRefundSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().min(1),
});

const paymentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    customerId: { type: 'string' },
    customerName: { type: 'string' },
    bookingId: { type: 'string' },
    amountPence: { type: 'integer' },
    currency: { type: 'string' },
    status: { type: 'string' },
    stripePaymentIntentId: { type: 'string' },
    date: { type: 'string' },
  },
};

async function adminPaymentsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/payments', {
    schema: {
      tags: ['Admin'],
      summary: 'List all payments with optional filters and pagination',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PENDING', 'PAID', 'REFUNDED', 'FAILED'] },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: paymentSchema },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
      },
    },
    preHandler: adminGuard,
    handler: async (
      request: FastifyRequest<{ Querystring: { status?: string; page?: number; pageSize?: number } }>,
      reply: FastifyReply,
    ) => {
      const { status, page = 1 } = request.query;
      const pageSize = Math.min(request.query.pageSize ?? 20, 100);
      const skip = (page - 1) * pageSize;
      const where = status ? { status: status as 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED' } : {};

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          include: {
            booking: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
          skip,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.payment.count({ where }),
      ]);

      await reply.status(200).send({
        data: payments.map((p) => ({
          id: p.id,
          customerId: p.booking.userId,
          customerName: `${p.booking.user.firstName} ${p.booking.user.lastName}`.trim(),
          bookingId: p.bookingId,
          amountPence: Math.round(p.amount.toNumber() * 100),
          currency: p.currency,
          status: PAYMENT_STATUS_MAP[p.status],
          stripePaymentIntentId: p.stripePaymentIntentId,
          date: p.createdAt.toISOString(),
        })),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });

  app.get('/api/v1/admin/payments/:paymentId', {
    schema: {
      tags: ['Admin'],
      summary: 'Get payment detail by ID',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { paymentId: { type: 'string' } } },
      response: { 200: paymentSchema },
    },
    preHandler: [...adminGuard, validate({ params: PaymentIdParamSchema })],
    handler: async (
      request: FastifyRequest<{ Params: { paymentId: string } }>,
      reply: FastifyReply,
    ) => {
      const payment = await prisma.payment.findUnique({
        where: { id: request.params.paymentId },
        include: {
          booking: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });
      if (!payment) throw new AppError('ACCOUNT_NOT_FOUND', 'Payment not found.', 404);

      await reply.status(200).send({
        id: payment.id,
        customerId: payment.booking.userId,
        customerName: `${payment.booking.user.firstName} ${payment.booking.user.lastName}`.trim(),
        bookingId: payment.bookingId,
        amountPence: Math.round(payment.amount.toNumber() * 100),
        currency: payment.currency,
        status: PAYMENT_STATUS_MAP[payment.status],
        stripePaymentIntentId: payment.stripePaymentIntentId,
        date: payment.createdAt.toISOString(),
      });
    },
  });

  app.post('/api/v1/admin/payments/:paymentId/refund', {
    schema: {
      tags: ['Admin'],
      summary: 'Trigger a refund for a payment',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { paymentId: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['amount', 'reason'],
        properties: {
          amount: { type: 'number', description: 'Amount in GBP' },
          reason: { type: 'string' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            paymentId: { type: 'string' },
            amount: { type: 'number' },
            reason: { type: 'string' },
            status: { type: 'string' },
            createdAt: { type: 'string' },
          },
        },
      },
    },
    preHandler: [
      ...adminGuard,
      validate({ params: PaymentIdParamSchema, body: AdminRefundSchema }),
    ],
    handler: async (
      request: FastifyRequest<{ Params: { paymentId: string }; Body: { amount: number; reason: string } }>,
      reply: FastifyReply,
    ) => {
      const refund = await refundsService.createRefund({
        paymentId: request.params.paymentId,
        amount: request.body.amount,
        reason: request.body.reason,
      });
      await reply.status(201).send(refund);
    },
  });
}

export default fp(adminPaymentsRoutes, { name: 'admin-payments-routes' });
