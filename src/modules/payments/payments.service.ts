/**
 * @file payments.service.ts
 * @description Stripe payment orchestration. Idempotent intent creation and webhook handling.
 * @module src/modules/payments/payments.service
 */
import { Prisma } from '@prisma/client';
import type { BookingStatus, PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';

import { AppError } from '@/shared/errors/AppError.js';
import { env } from '@/config/env.js';
import { eventBus } from '@/shared/events/event-bus.js';
import { EventType } from '@/shared/events/event-types.js';
import { logger } from '@/shared/infrastructure/logger.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { getStripeClient } from '@/shared/utils/stripe.js';
import { withTransaction } from '@/shared/utils/transaction.js';

import { mapToPaymentResponse } from './payments.domain.js';
import { paymentsRepository } from './payments.repository.js';
import type { ICreatePaymentIntent, IPaymentIntentResponse, IPaymentResponse } from './payments.schema.js';

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

async function generateEventBookingRef(tx: TxClient): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const candidate = `EVT${Math.random().toString().slice(2, 8)}`;
    const existing = await tx.calendarEventBooking.findUnique({
      where: { bookingReference: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error('Unable to generate booking reference after 5 attempts');
}

/**
 * Auto-confirms an event booking intent triggered by a Stripe checkout.session.completed
 * webhook. Handles both V1 (single-event, eventId set) and V2 (cart, eventId null with items).
 * Idempotent — safe to call multiple times for the same session.
 */
async function autoConfirmEventBookingIntent(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const intentId = session.client_reference_id;
  if (!intentId) {
    logger.warn({ sessionId: session.id }, 'Webhook: checkout.session.completed missing client_reference_id');
    return;
  }

  const stripePaymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

  const intent = await prisma.eventBookingIntent.findUnique({
    where: { id: intentId },
    include: {
      items: {
        include: {
          slot: {
            include: {
              eventDate: {
                include: {
                  event: { select: { id: true, title: true, currency: true, addons: true, minAgeYears: true, maxAgeYears: true } },
                },
              },
            },
          },
          child: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      booking: { select: { id: true } },
    },
  });

  if (!intent) {
    logger.warn({ intentId, sessionId: session.id }, 'Webhook: EventBookingIntent not found');
    return;
  }

  if (intent.booking) {
    logger.info({ intentId, bookingId: intent.booking.id }, 'Webhook: booking already confirmed, skipping');
    return;
  }

  if (intent.status === 'CONFIRMED' || intent.status === 'CANCELLED') {
    logger.info({ intentId, status: intent.status }, 'Webhook: intent already in terminal state, skipping');
    return;
  }

  const resolvedStatus: BookingStatus = 'CONFIRMED';
  const userId = intent.userId;

  try {
    await withTransaction(prisma, async (tx) => {
      const existingBooking = await tx.calendarEventBooking.findFirst({
        where: { intentId: intent.id, userId },
        select: { id: true },
      });
      if (existingBooking) return;

      const bookingReference = await generateEventBookingRef(tx);

      if (intent.eventId) {
        // ── V1: single-event intent ─────────────────────────────────────────
        const duplicateV1 = await tx.calendarEventBooking.findFirst({
          where: {
            eventId: intent.eventId,
            userId,
            childId: intent.childId ?? null,
            status: { notIn: ['CANCELLED', 'REFUNDED'] },
          },
          select: { id: true },
        });
        if (duplicateV1) {
          logger.warn({ intentId }, 'Webhook V1: duplicate booking exists, skipping');
          return;
        }

        const booking = await tx.calendarEventBooking.create({
          data: {
            eventId: intent.eventId,
            userId,
            childId: intent.childId,
            intentId: intent.id,
            notes: intent.medicalNotes,
            medicalNotes: intent.medicalNotes,
            status: resolvedStatus,
            bookingReference,
            fullName: intent.fullName,
            email: intent.email,
            phone: intent.phone,
            paymentMethod: intent.paymentMethod,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: stripePaymentIntentId ?? null,
            currency: intent.currency,
            subtotal: intent.subtotal,
            addonsTotal: intent.addonsTotal,
            discountTotal: intent.discountTotal,
            serviceFee: intent.serviceFee,
            totalPaid: intent.total,
            receiptUrl: `${env.BASE_URL}/api/v1/bookings/${bookingReference}/receipt`,
          },
        });

        await tx.calendarEventBooking.update({
          where: { id: booking.id },
          data: { receiptUrl: `${env.BASE_URL}/api/v1/bookings/${booking.id}/receipt` },
        });
      } else {
        // ── V2: cart intent with items ──────────────────────────────────────
        if (intent.items.length === 0) {
          logger.warn({ intentId }, 'Webhook V2: cart is empty, skipping');
          return;
        }

        for (const item of intent.items) {
          const slot = await tx.calendarEventSlot.findUnique({
            where: { id: item.slotId },
            select: { id: true, capacity: true, bookedCount: true, isActive: true },
          });
          if (!slot || !slot.isActive || slot.bookedCount >= slot.capacity) {
            logger.warn({ intentId, slotId: item.slotId }, 'Webhook V2: slot unavailable, skipping confirm');
            return;
          }
        }

        const subtotal = intent.items.reduce((s, i) => s + i.lineSubtotal.toNumber(), 0);
        const addonsTotal = intent.items.reduce((s, i) => s + i.lineAddonsTotal.toNumber(), 0);
        const serviceFee = intent.items.reduce((s, i) => s + i.lineServiceFee.toNumber(), 0);
        const totalPaid = Number((subtotal + addonsTotal + serviceFee).toFixed(2));

        const created = await tx.calendarEventBooking.create({
          data: {
            userId,
            intentId: intent.id,
            status: resolvedStatus,
            bookingReference,
            fullName: intent.fullName,
            email: intent.email,
            phone: intent.phone,
            paymentMethod: intent.paymentMethod,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: stripePaymentIntentId ?? null,
            currency: intent.currency,
            subtotal,
            addonsTotal,
            discountTotal: 0,
            serviceFee,
            totalPaid,
            receiptUrl: null,
            items: {
              create: intent.items.map((item) => ({
                slotId: item.slotId,
                eventId: item.slot.eventDate.event.id,
                eventDateId: item.slot.eventDateId,
                childId: item.childId,
                medicalNotes: item.medicalNotes,
                addons: (item.addons ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                lineSubtotal: item.lineSubtotal,
                lineAddonsTotal: item.lineAddonsTotal,
                lineServiceFee: item.lineServiceFee,
                lineTotal: item.lineTotal,
              })),
            },
          },
        });

        for (const item of intent.items) {
          await tx.calendarEventSlot.update({
            where: { id: item.slotId },
            data: { bookedCount: { increment: 1 } },
          });
        }

        await tx.calendarEventBooking.update({
          where: { id: created.id },
          data: { receiptUrl: `${env.BASE_URL}/api/v2/bookings/${created.id}/receipt` },
        });
      }

      await tx.eventBookingIntent.update({
        where: { id: intent.id },
        data: {
          status: 'CONFIRMED',
          currentStep: 'success',
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: stripePaymentIntentId ?? undefined,
        },
      });
    });

    logger.info({ intentId, sessionId: session.id }, 'Webhook: event booking auto-confirmed');
  } catch (err) {
    logger.error({ intentId, sessionId: session.id, err }, 'Webhook: failed to auto-confirm event booking');
  }
}

export const paymentsService = {
  async createPaymentIntent(
    userId: string,
    input: ICreatePaymentIntent,
  ): Promise<IPaymentIntentResponse> {
    const booking = await paymentsRepository.findBookingById(input.bookingId, userId);

    if (!booking) {
      throw new AppError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
    }

    if (booking.status === 'CANCELLED' || booking.status === 'REFUNDED') {
      throw new AppError(
        'BOOKING_ALREADY_CANCELLED',
        'Cannot create a payment intent for a cancelled or refunded booking.',
        409,
      );
    }

    // Idempotency — return existing payment intent if already created for this booking
    const existingPayment = await paymentsRepository.findByBookingId(input.bookingId);
    if (existingPayment) {
      const stripe = getStripeClient();
      const intent = await stripe.paymentIntents.retrieve(
        existingPayment.stripePaymentIntentId,
      );
      return {
        clientSecret: intent.client_secret!,
        paymentId: existingPayment.id,
        amount: Math.round(existingPayment.amount.toNumber() * 100),
        currency: existingPayment.currency,
      };
    }

    const stripe = getStripeClient();
    const amountInPence = Math.round(booking.session.price.toNumber() * 100);

    const intent = await stripe.paymentIntents.create(
      {
        amount: amountInPence,
        currency: 'gbp',
        metadata: { bookingId: booking.id, userId },
      },
      { idempotencyKey: `booking-${booking.id}` },
    );

    const payment = await paymentsRepository.create({
      bookingId: booking.id,
      stripePaymentIntentId: intent.id,
      amount: booking.session.price,
      currency: 'gbp',
    });

    return {
      clientSecret: intent.client_secret!,
      paymentId: payment.id,
      amount: amountInPence,
      currency: 'gbp',
    };
  },

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new AppError('SERVER_ERROR', 'Stripe webhook secret is not configured.', 500);
    }

    const stripe = getStripeClient();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Invalid Stripe webhook signature.', 400);
    }

    logger.info({ type: event.type, id: event.id }, 'Stripe webhook received');

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        const payment = await paymentsRepository.findByStripeIntentId(intent.id);
        if (!payment) {
          logger.warn({ intentId: intent.id }, 'Webhook: payment record not found');
          return;
        }
        if (payment.status === 'PAID') return; // idempotency — already processed

        await paymentsRepository.updateStatusByStripeIntentId(intent.id, 'PAID');
        await paymentsRepository.updateBookingStatus(payment.bookingId, 'CONFIRMED');

        eventBus.emit(EventType.PAYMENT_SUCCEEDED, {
          paymentId: payment.id,
          bookingId: payment.bookingId,
          userId: intent.metadata?.userId ?? '',
        });
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        const payment = await paymentsRepository.findByStripeIntentId(intent.id);
        if (!payment) return;
        if (payment.status === 'FAILED') return;

        await paymentsRepository.updateStatusByStripeIntentId(intent.id, 'FAILED');

        eventBus.emit(EventType.PAYMENT_FAILED, {
          paymentId: payment.id,
          bookingId: payment.bookingId,
          userId: intent.metadata?.userId ?? '',
        });
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== 'paid') break;
        await autoConfirmEventBookingIntent(session);
        break;
      }

      default:
        logger.debug({ type: event.type }, 'Stripe webhook: unhandled event type');
    }
  },

  async getPaymentById(paymentId: string): Promise<IPaymentResponse> {
    const payment = await paymentsRepository.findById(paymentId);
    if (!payment) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'Payment not found.', 404);
    }
    return mapToPaymentResponse(payment);
  },
};
