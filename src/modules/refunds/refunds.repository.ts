/**
 * @file refunds.repository.ts
 * @description Data access layer for refunds.
 * @module src/modules/refunds/refunds.repository
 */
import type { Prisma, RefundStatus } from '@prisma/client';

import { prisma } from '@/shared/infrastructure/prisma.js';

export const refundsRepository = {
  async findPaymentById(paymentId: string) {
    return prisma.payment.findUnique({ where: { id: paymentId } });
  },

  async create(data: {
    paymentId: string;
    amount: Prisma.Decimal;
    reason: string;
    stripeRefundId?: string;
  }) {
    return prisma.refund.create({
      data: { ...data, status: 'PENDING' },
    });
  },

  async updateStatus(refundId: string, status: RefundStatus, stripeRefundId?: string) {
    return prisma.refund.update({
      where: { id: refundId },
      data: { status, ...(stripeRefundId && { stripeRefundId }) },
    });
  },

  async updatePaymentStatus(paymentId: string) {
    return prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'REFUNDED' },
    });
  },

  async findById(refundId: string) {
    return prisma.refund.findUnique({ where: { id: refundId } });
  },
};
