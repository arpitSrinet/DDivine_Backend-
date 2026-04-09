/**
 * @file payment.handlers.ts
 * @description Event handlers for all domain events. Registered at app startup.
 * Phase 6: creates notification records and enqueues email/invoice jobs.
 * @module src/shared/events/handlers/payment.handlers
 */
import type { Prisma } from '@prisma/client';

import { notificationsService } from '@/modules/notifications/notifications.service.js';
import { NOTIFICATION_TYPES } from '@/modules/notifications/notifications.schema.js';
import { invoicesService } from '@/modules/invoices/invoices.service.js';
import { emailQueue } from '@/modules/jobs/queues/email.queue.js';
import { invoiceQueue } from '@/modules/jobs/queues/invoice.queue.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { logger } from '@/shared/infrastructure/logger.js';

import { eventBus } from '../event-bus.js';
import { EventType } from '../event-types.js';

async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
}

export function registerPaymentHandlers(): void {
  // --- Booking Created ---
  eventBus.on(EventType.BOOKING_CREATED, async ({ bookingId, userId, sessionId }) => {
    logger.info({ bookingId, userId, sessionId }, 'booking.created: processing');

    const [user, booking] = await Promise.all([
      getUserById(userId),
      prisma.booking.findUnique({
        where: { id: bookingId },
        include: { session: { include: { service: true } } },
      }),
    ]);

    if (!user || !booking) return;

    await notificationsService.create({
      userId,
      type: NOTIFICATION_TYPES.BOOKING_CONFIRMED,
      title: 'Booking Confirmed',
      body: `Your booking for ${booking.session.service.title} on ${booking.session.date.toLocaleDateString('en-GB')} has been confirmed.`,
      metadata: { bookingId } as Prisma.InputJsonValue,
    });

    await emailQueue.add('booking-confirmation', {
      bookingId,
      userId,
      userEmail: user.email,
      userFirstName: user.firstName,
      serviceName: booking.session.service.title,
      sessionDate: booking.session.date.toISOString(),
      sessionTime: booking.session.time,
      location: booking.session.location,
    });
  });

  // --- Payment Succeeded ---
  eventBus.on(EventType.PAYMENT_SUCCEEDED, async ({ paymentId, bookingId, userId }) => {
    logger.info({ paymentId }, 'payment.succeeded: creating invoice');

    await invoicesService.createForPayment(paymentId);

    const [user, payment] = await Promise.all([
      getUserById(userId),
      prisma.payment.findUnique({
        where: { id: paymentId },
        include: { invoice: true },
      }),
    ]);

    if (!user || !payment) return;

    await notificationsService.create({
      userId,
      type: NOTIFICATION_TYPES.PAYMENT_CONFIRMED,
      title: 'Payment Received',
      body: `Your payment of £${payment.amount.toNumber().toFixed(2)} has been received.`,
      metadata: { paymentId, bookingId } as Prisma.InputJsonValue,
    });

    await emailQueue.add('payment-confirmation', {
      paymentId,
      userId,
      userEmail: user.email,
      userFirstName: user.firstName,
      amount: payment.amount.toNumber(),
      currency: payment.currency,
      invoiceId: payment.invoice?.id,
    });

    if (payment.invoice) {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { session: { include: { service: true } } },
      });

      if (booking) {
        await invoiceQueue.add('generate-pdf', {
          invoiceId: payment.invoice.id,
          paymentId,
          userId,
          userEmail: user.email,
          userFirstName: user.firstName,
          userLastName: user.lastName,
          amount: payment.amount.toNumber(),
          currency: payment.currency,
          bookingId,
          serviceName: booking.session.service.title,
          sessionDate: booking.session.date.toISOString(),
        });
      }
    }
  });

  // --- Payment Failed ---
  eventBus.on(EventType.PAYMENT_FAILED, async ({ paymentId, userId }) => {
    logger.warn({ paymentId, userId }, 'payment.failed: notifying user');

    const user = await getUserById(userId);
    if (!user) return;

    await notificationsService.create({
      userId,
      type: NOTIFICATION_TYPES.PAYMENT_FAILED,
      title: 'Payment Failed',
      body: 'Your recent payment could not be processed. Please try again.',
      metadata: { paymentId } as Prisma.InputJsonValue,
    });

    await emailQueue.add('payment-failed', {
      paymentId,
      userId,
      userEmail: user.email,
      userFirstName: user.firstName,
    });
  });

  // --- Refund Issued ---
  eventBus.on(EventType.REFUND_ISSUED, async ({ refundId, paymentId, userId }) => {
    logger.info({ refundId, paymentId }, 'refund.issued: notifying user');

    if (!userId) return;

    const [user, refund] = await Promise.all([
      getUserById(userId),
      prisma.refund.findUnique({ where: { id: refundId } }),
    ]);

    if (!user || !refund) return;

    await notificationsService.create({
      userId,
      type: NOTIFICATION_TYPES.REFUND_ISSUED,
      title: 'Refund Processed',
      body: `Your refund of £${refund.amount.toNumber().toFixed(2)} has been processed.`,
      metadata: { refundId, paymentId } as Prisma.InputJsonValue,
    });

    await emailQueue.add('refund-issued', {
      refundId,
      paymentId,
      userId,
      userEmail: user.email,
      userFirstName: user.firstName,
      amount: refund.amount.toNumber(),
    });
  });
}
