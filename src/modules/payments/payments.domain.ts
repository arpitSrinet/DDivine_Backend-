/**
 * @file payments.domain.ts
 * @description Pure domain logic for payments. Maps Prisma Payment model to API response.
 * @module src/modules/payments/payments.domain
 */
import type { Payment } from '@prisma/client';

import { PAYMENT_STATUS_MAP } from './payments.schema.js';
import type { IPaymentResponse } from './payments.schema.js';

export function mapToPaymentResponse(payment: Payment): IPaymentResponse {
  return {
    id: payment.id,
    bookingId: payment.bookingId,
    amount: payment.amount.toNumber(),
    currency: payment.currency,
    status: PAYMENT_STATUS_MAP[payment.status] as IPaymentResponse['status'],
    stripePaymentIntentId: payment.stripePaymentIntentId,
  };
}
