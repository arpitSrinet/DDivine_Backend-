/**
 * @file payments.service.ts
 * @description Stripe payment orchestration. Idempotent intent creation and webhook handling.
 * @module src/modules/payments/payments.service
 */
import type Stripe from 'stripe';

import { AppError } from '@/shared/errors/AppError.js';
import { env } from '@/config/env.js';
import { eventBus } from '@/shared/events/event-bus.js';
import { EventType } from '@/shared/events/event-types.js';
import { logger } from '@/shared/infrastructure/logger.js';
import { getStripeClient } from '@/shared/utils/stripe.js';

import { mapToPaymentResponse } from './payments.domain.js';
import { paymentsRepository } from './payments.repository.js';
import type { ICreatePaymentIntent, IPaymentIntentResponse, IPaymentResponse } from './payments.schema.js';

export const paymentsService = {
  async createPaymentIntent(
    userId: string,
    input: ICreatePaymentIntent,
  ): Promise<IPaymentIntentResponse> {
    const booking = await paymentsRepository.findBookingById(input.bookingId, userId);

    if (!booking) {
      throw new AppError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
    }

    if (booking.status === 'CANCELLED') {
      throw new AppError('BOOKING_ALREADY_CANCELLED', 'Cannot pay for a cancelled booking.', 409);
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
