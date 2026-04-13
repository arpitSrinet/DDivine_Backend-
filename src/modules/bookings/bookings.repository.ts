/**
 * @file bookings.repository.ts
 * @description Data access layer for bookings. All Prisma queries live here.
 * @module src/modules/bookings/bookings.repository
 */
import type { Prisma, PrismaClient } from '@prisma/client';

import { CapacityExceededError } from '@/shared/domain/errors/CapacityExceededError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const bookingInclude = {
  session: {
    include: { service: { select: { title: true } } },
  },
} satisfies Prisma.BookingInclude;

const eventBookingInclude = {
  event: true,
  child: {
    select: { firstName: true, lastName: true },
  },
} satisfies Prisma.CalendarEventBookingInclude;

export const bookingsRepository = {
  async findSessionById(sessionId: string) {
    return prisma.session.findFirst({
      where: { id: sessionId, isActive: true },
    });
  },

  async findChildByIdAndUserId(childId: string, userId: string) {
    return prisma.child.findFirst({
      where: { id: childId, userId },
    });
  },

  async findAllByUserId(userId: string) {
    return prisma.booking.findMany({
      where: { userId },
      include: bookingInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  async findAllEventBookingsByUserId(userId: string) {
    return prisma.calendarEventBooking.findMany({
      where: { userId },
      include: eventBookingInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  async findByIdAndUserId(bookingId: string, userId: string) {
    return prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: bookingInclude,
    });
  },

  async findEventBookingByIdAndUserId(bookingId: string, userId: string) {
    return prisma.calendarEventBooking.findFirst({
      where: { id: bookingId, userId },
      include: eventBookingInclude,
    });
  },

  async findActiveBookingsForChild(childId: string) {
    return prisma.booking.findMany({
      where: { childId, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
      include: {
        session: { select: { date: true, time: true } },
      },
    });
  },

  async createWithCapacityLock(
    tx: TxClient,
    data: {
      userId: string;
      sessionId: string;
      childId?: string;
      price: Prisma.Decimal;
    },
  ) {
    // Lock + fetch the session in a single query to prevent concurrent overbooking
    const [lockedSession] = await tx.$queryRaw<
      Array<{ id: string; currentCapacity: number; maxCapacity: number }>
    >`
      SELECT id, "currentCapacity", "maxCapacity"
      FROM "Session"
      WHERE id = ${data.sessionId}
      FOR UPDATE
    `;

    if (!lockedSession || lockedSession.currentCapacity >= lockedSession.maxCapacity) {
      throw new CapacityExceededError('This session is fully booked.');
    }

    await tx.session.update({
      where: { id: data.sessionId },
      data: { currentCapacity: { increment: 1 } },
    });

    return tx.booking.create({
      data: {
        userId: data.userId,
        sessionId: data.sessionId,
        childId: data.childId,
        price: data.price,
        status: 'PENDING_PAYMENT',
      },
      include: bookingInclude,
    });
  },

  async cancelById(
    tx: TxClient,
    bookingId: string,
    sessionId: string,
  ) {
    const [booking] = await Promise.all([
      tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
        include: bookingInclude,
      }),
      tx.session.update({
        where: { id: sessionId },
        data: { currentCapacity: { decrement: 1 } },
      }),
    ]);
    return booking;
  },

  async cancelEventBookingById(bookingId: string) {
    return prisma.calendarEventBooking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
      include: eventBookingInclude,
    });
  },
};
