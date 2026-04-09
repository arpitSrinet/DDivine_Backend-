/**
 * @file admin-refunds.routes.ts
 * @description Admin refunds management — list and view all refunds across the platform.
 * Requires ADMIN role.
 * @module src/modules/admin-refunds/admin-refunds.routes
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];
const RefundIdParamSchema = z.object({ refundId: z.string().min(1) });

const REFUND_STATUS_MAP: Record<string, string> = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

const refundSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    paymentId: { type: 'string' },
    customerId: { type: 'string' },
    customerName: { type: 'string' },
    amountPence: { type: 'integer' },
    reason: { type: 'string' },
    status: { type: 'string' },
    date: { type: 'string' },
  },
};

async function adminRefundsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/refunds', {
    schema: {
      tags: ['Admin'],
      summary: 'List all refunds with optional filters and pagination',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PENDING', 'COMPLETED', 'FAILED'] },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: refundSchema },
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
      const where = status ? { status: status as 'PENDING' | 'COMPLETED' | 'FAILED' } : {};

      const [refunds, total] = await Promise.all([
        prisma.refund.findMany({
          where,
          include: {
            payment: {
              include: {
                booking: {
                  include: {
                    user: { select: { id: true, firstName: true, lastName: true } },
                  },
                },
              },
            },
          },
          skip,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.refund.count({ where }),
      ]);

      await reply.status(200).send({
        data: refunds.map((r) => ({
          id: r.id,
          paymentId: r.paymentId,
          customerId: r.payment.booking.userId,
          customerName: `${r.payment.booking.user.firstName} ${r.payment.booking.user.lastName}`.trim(),
          amountPence: Math.round(r.amount.toNumber() * 100),
          reason: r.reason,
          status: REFUND_STATUS_MAP[r.status] ?? r.status.toLowerCase(),
          date: r.createdAt.toISOString(),
        })),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });

  app.get('/api/v1/admin/refunds/:refundId', {
    schema: {
      tags: ['Admin'],
      summary: 'Get refund detail by ID',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { refundId: { type: 'string' } } },
      response: { 200: refundSchema },
    },
    preHandler: [...adminGuard, validate({ params: RefundIdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: { refundId: string } }>, reply: FastifyReply) => {
      const refund = await prisma.refund.findUnique({
        where: { id: request.params.refundId },
        include: {
          payment: {
            include: {
              booking: {
                include: {
                  user: { select: { id: true, firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      });

      if (!refund) throw new AppError('ACCOUNT_NOT_FOUND', 'Refund not found.', 404);

      await reply.status(200).send({
        id: refund.id,
        paymentId: refund.paymentId,
        customerId: refund.payment.booking.userId,
        customerName: `${refund.payment.booking.user.firstName} ${refund.payment.booking.user.lastName}`.trim(),
        amountPence: Math.round(refund.amount.toNumber() * 100),
        reason: refund.reason,
        status: REFUND_STATUS_MAP[refund.status] ?? refund.status.toLowerCase(),
        date: refund.createdAt.toISOString(),
      });
    },
  });
}

export default fp(adminRefundsRoutes, { name: 'admin-refunds-routes' });
