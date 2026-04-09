/**
 * @file refunds.service.ts
 * @description Refund orchestration. Validates refund amount against original payment.
 * @module src/modules/refunds/refunds.service
 */
import { Prisma } from '@prisma/client';

import { AppError } from '@/shared/errors/AppError.js';
import { eventBus } from '@/shared/events/event-bus.js';
import { EventType } from '@/shared/events/event-types.js';
import { logger } from '@/shared/infrastructure/logger.js';
import { getStripeClient } from '@/shared/utils/stripe.js';

import { REFUND_STATUS_MAP } from './refunds.schema.js';
import { refundsRepository } from './refunds.repository.js';
import type { ICreateRefund, IRefundResponse } from './refunds.schema.js';

function mapToRefundResponse(refund: {
  id: string;
  paymentId: string;
  amount: Prisma.Decimal;
  reason: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: Date;
}): IRefundResponse {
  return {
    id: refund.id,
    paymentId: refund.paymentId,
    amount: refund.amount.toNumber(),
    reason: refund.reason,
    status: REFUND_STATUS_MAP[refund.status] as IRefundResponse['status'],
    createdAt: refund.createdAt.toISOString(),
  };
}

export const refundsService = {
  async createRefund(input: ICreateRefund): Promise<IRefundResponse> {
    const payment = await refundsRepository.findPaymentById(input.paymentId);

    if (!payment) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'Payment not found.', 404);
    }

    if (payment.status !== 'PAID') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Refunds can only be issued for paid payments.',
        422,
      );
    }

    const originalAmount = payment.amount.toNumber();
    if (input.amount > originalAmount) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Refund amount (£${input.amount}) cannot exceed original payment (£${originalAmount}).`,
        422,
        { errors: [{ field: 'amount', message: 'Amount exceeds original payment.' }] },
      );
    }

    const stripe = getStripeClient();
    const amountInPence = Math.round(input.amount * 100);

    // Create refund record first (PENDING)
    const refund = await refundsRepository.create({
      paymentId: input.paymentId,
      amount: new Prisma.Decimal(input.amount),
      reason: input.reason,
    });

    try {
      const stripeRefund = await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: amountInPence,
        reason: 'requested_by_customer',
      });

      await refundsRepository.updateStatus(refund.id, 'COMPLETED', stripeRefund.id);
      await refundsRepository.updatePaymentStatus(input.paymentId);

      eventBus.emit(EventType.REFUND_ISSUED, {
        refundId: refund.id,
        paymentId: input.paymentId,
        userId: payment.booking.userId,
      });

      logger.info({ refundId: refund.id, stripeRefundId: stripeRefund.id }, 'Refund completed');

      return mapToRefundResponse({ ...refund, status: 'COMPLETED' });
    } catch (error) {
      await refundsRepository.updateStatus(refund.id, 'FAILED');
      logger.error({ err: error, refundId: refund.id }, 'Stripe refund failed');
      throw new AppError('SERVER_ERROR', 'Refund processing failed. Please try again.', 500);
    }
  },

  async getRefundById(refundId: string): Promise<IRefundResponse> {
    const refund = await refundsRepository.findById(refundId);
    if (!refund) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'Refund not found.', 404);
    }
    return mapToRefundResponse(refund);
  },
};
