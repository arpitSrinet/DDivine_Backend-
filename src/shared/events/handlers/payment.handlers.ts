/**
 * @file payment.handlers.ts
 * @description Event handlers for payment-related events. Registered at app startup.
 * @module src/shared/events/handlers/payment.handlers
 */
import { logger } from '@/shared/infrastructure/logger.js';
import { invoicesService } from '@/modules/invoices/invoices.service.js';

import { eventBus } from '../event-bus.js';
import { EventType } from '../event-types.js';

export function registerPaymentHandlers(): void {
  eventBus.on(EventType.PAYMENT_SUCCEEDED, async ({ paymentId }) => {
    logger.info({ paymentId }, 'payment.succeeded: creating invoice');
    await invoicesService.createForPayment(paymentId);
  });

  eventBus.on(EventType.PAYMENT_FAILED, ({ paymentId, userId }) => {
    logger.warn({ paymentId, userId }, 'payment.failed: payment failed');
    // Phase 6: trigger email notification to user
  });

  eventBus.on(EventType.REFUND_ISSUED, ({ refundId, paymentId }) => {
    logger.info({ refundId, paymentId }, 'refund.issued: refund processed');
    // Phase 6: trigger email notification to user
  });
}
