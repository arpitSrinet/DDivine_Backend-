/**
 * @file payments.repository.ts
 * @description Data access layer for payments.
 * @module src/modules/payments/payments.repository
 */
import type { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';

import { prisma } from '@/shared/infrastructure/prisma.js';

export const paymentsRepository = {
  async findBookingById(bookingId: string, userId: string) {
    return prisma.booking.findFirst({
      where: { id: bookingId, userId },
      select: {
        id: true,
        userId: true,
        childId: true,
        status: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
        sessionId: true,
        price: true,
        paymentType: true,
        session: { select: { price: true } },
      },
    });
  },

  async findByBookingId(bookingId: string) {
    return prisma.payment.findUnique({
      where: { bookingId },
    });
  },

  async findByStripeIntentId(stripePaymentIntentId: string) {
    return prisma.payment.findUnique({
      where: { stripePaymentIntentId },
    });
  },

  async findById(paymentId: string) {
    return prisma.payment.findUnique({
      where: { id: paymentId },
    });
  },

  async create(data: {
    bookingId: string;
    stripePaymentIntentId: string;
    amount: Prisma.Decimal;
    currency: string;
  }) {
    return prisma.payment.create({ data: { ...data, status: 'PENDING' } });
  },

  async updateStatus(paymentId: string, status: PaymentStatus) {
    return prisma.payment.update({
      where: { id: paymentId },
      data: { status },
    });
  },

  async updateStatusByStripeIntentId(
    stripePaymentIntentId: string,
    status: PaymentStatus,
  ) {
    return prisma.payment.update({
      where: { stripePaymentIntentId },
      data: { status },
    });
  },

  async updateBookingStatus(bookingId: string, status: BookingStatus) {
    return prisma.booking.update({
      where: { id: bookingId },
      data: {
        status,
        ...(status === 'CONFIRMED' ? { paymentStatus: 'PAID' } : {}),
        ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
      },
    });
  },
};
