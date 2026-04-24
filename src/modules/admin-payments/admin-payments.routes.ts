/**
 * @file admin-payments.routes.ts
 * @description Admin payments management (Event bookings v2) — list + view.
 * NOTE: Payment rows for event bookings live on CalendarEventBooking (not Payment table).
 * Requires ADMIN role.
 * @module src/modules/admin-payments/admin-payments.routes
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
const PaymentIdParamSchema = z.object({ paymentId: z.string().min(1) }); // maps to CalendarEventBooking.id

const paymentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    customerId: { type: 'string' },
    customerName: { type: 'string' },
    amountPence: { type: 'integer' },
    currency: { type: 'string' },
    status: { type: 'string' }, // booking status mapped for display
    method: { type: 'string' },
    stripePaymentIntentId: { type: 'string' },
    date: { type: 'string' },
  },
};

const statusMap: Record<string, string> = {
  PENDING: 'pending_payment',
  PENDING_PAYMENT: 'pending_payment',
  GOVERNMENT_PAYMENT_PENDING: 'government_payment_pending',
  CONFIRMED: 'confirmed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
};

function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

function deriveCustomerName(row: {
  fullName: string | null;
  user?: { firstName: string; lastName: string } | null;
}): string {
  const name = row.fullName?.trim();
  if (name) return name;
  const fallback = `${row.user?.firstName ?? ''} ${row.user?.lastName ?? ''}`.trim();
  return fallback || '—';
}

async function adminPaymentsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/payments', {
    schema: {
      tags: ['Admin'],
      summary: 'List all EVENT booking payments (CalendarEventBooking) with optional filters and pagination',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Booking status (e.g. CONFIRMED)' },
          method: { type: 'string', description: 'stripe | tax_free_childcare | card' },
          q: { type: 'string', description: 'Search by reference, email, or name' },
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
      request: FastifyRequest<{ Querystring: { status?: string; method?: string; q?: string; page?: number; pageSize?: number } }>,
      reply: FastifyReply,
    ) => {
      const { status, method, q, page = 1 } = request.query;
      const pageSize = Math.min(request.query.pageSize ?? 20, 100);
      const skip = (page - 1) * pageSize;
      const where = {
        ...(status && { status: status as any }),
        ...(method && { paymentMethod: method.toUpperCase() as any }),
        ...(q && {
          OR: [
            { bookingReference: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
            { fullName: { contains: q, mode: 'insensitive' as const } },
            { user: { email: { contains: q, mode: 'insensitive' as const } } },
            { user: { firstName: { contains: q, mode: 'insensitive' as const } } },
            { user: { lastName: { contains: q, mode: 'insensitive' as const } } },
          ],
        }),
      } as const;

      const [payments, total] = await Promise.all([
        prisma.calendarEventBooking.findMany({
          where,
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
          skip,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.calendarEventBooking.count({ where }),
      ]);

      await reply.status(200).send({
        data: payments.map((p) => ({
          id: p.id,
          customerId: p.userId,
          customerName: deriveCustomerName({ fullName: p.fullName, user: p.user }),
          amountPence: Math.round(toNum(p.totalPaid) * 100),
          currency: p.currency,
          status: statusMap[p.status] ?? String(p.status).toLowerCase(),
          method: p.paymentMethod?.toLowerCase() ?? undefined,
          stripePaymentIntentId: p.stripePaymentIntentId ?? undefined,
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
      summary: 'Get EVENT booking payment detail by ID (CalendarEventBooking.id)',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { paymentId: { type: 'string' } } },
      response: { 200: paymentSchema },
    },
    preHandler: [...adminGuard, validate({ params: PaymentIdParamSchema })],
    handler: async (
      request: FastifyRequest<{ Params: { paymentId: string } }>,
      reply: FastifyReply,
    ) => {
      const payment = await prisma.calendarEventBooking.findUnique({
        where: { id: request.params.paymentId },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      });
      if (!payment) throw new AppError('ACCOUNT_NOT_FOUND', 'Payment not found.', 404);

      await reply.status(200).send({
        id: payment.id,
        customerId: payment.userId,
        customerName: deriveCustomerName({ fullName: payment.fullName, user: payment.user }),
        amountPence: Math.round(toNum(payment.totalPaid) * 100),
        currency: payment.currency,
        status: statusMap[payment.status] ?? String(payment.status).toLowerCase(),
        method: payment.paymentMethod?.toLowerCase() ?? undefined,
        stripePaymentIntentId: payment.stripePaymentIntentId ?? undefined,
        date: payment.createdAt.toISOString(),
      });
    },
  });
}

export default fp(adminPaymentsRoutes, { name: 'admin-payments-routes' });
