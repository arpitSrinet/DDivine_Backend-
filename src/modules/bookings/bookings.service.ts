/**
 * @file bookings.service.ts
 * @description Core booking engine. Enforces all domain invariants inside a serializable transaction.
 * @module src/modules/bookings/bookings.service
 */
import { AppError } from '@/shared/errors/AppError.js';
import { assertAgeEligible } from '@/shared/domain/invariants/assertAgeEligible.js';
import { assertNoOverlap } from '@/shared/domain/invariants/assertNoOverlap.js';
import { eventBus } from '@/shared/events/event-bus.js';
import { EventType } from '@/shared/events/event-types.js';
import { prisma } from '@/shared/infrastructure/prisma.js'; // only for withTransaction
import { redis } from '@/shared/infrastructure/redis.js';
import { withTransaction } from '@/shared/utils/transaction.js';

import { mapEventBookingToBookingResponse, mapToBookingResponse } from './bookings.domain.js';
import { bookingsRepository } from './bookings.repository.js';
import type { IBookingResponse, ICreateBooking } from './bookings.schema.js';

export const bookingsService = {
  async getMyBookings(userId: string): Promise<IBookingResponse[]> {
    const [sessionBookings, eventBookings] = await Promise.all([
      bookingsRepository.findAllByUserId(userId),
      bookingsRepository.findAllEventBookingsByUserId(userId),
    ]);
    const merged = [
      ...sessionBookings.map((booking) => ({
        createdAt: booking.createdAt,
        response: mapToBookingResponse(booking),
      })),
      ...eventBookings.map((booking) => ({
        createdAt: booking.createdAt,
        response: mapEventBookingToBookingResponse(booking),
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return merged.map((item) => item.response);
  },

  async getBookingById(userId: string, bookingId: string): Promise<IBookingResponse> {
    const booking = await bookingsRepository.findByIdAndUserId(bookingId, userId);
    if (booking) {
      return mapToBookingResponse(booking);
    }

    const eventBooking = await bookingsRepository.findEventBookingByIdAndUserId(bookingId, userId);
    if (!eventBooking) {
      throw new AppError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
    }
    return mapEventBookingToBookingResponse(eventBooking, { includeDetail: true });
  },

  async createBooking(userId: string, input: ICreateBooking): Promise<IBookingResponse> {
    // --- Idempotency check ---
    if (input.idempotencyKey) {
      const cacheKey = `idempotency:booking:${input.idempotencyKey}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as IBookingResponse;
      }
    }

    // --- Load session via repository (no direct Prisma) ---
    const session = await bookingsRepository.findSessionById(input.sessionId);

    if (!session) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'Session not found.', 404);
    }

    // --- Domain invariant: age eligibility and overlap (child bookings only) ---
    // Capacity is NOT checked here — it is enforced inside the transaction with a row lock
    if (input.childId) {
      const child = await bookingsRepository.findChildByIdAndUserId(input.childId, userId);

      if (!child) {
        throw new AppError('ACCOUNT_NOT_FOUND', 'Child not found.', 404);
      }

      assertAgeEligible(child, session);

      const existingBookings = await bookingsRepository.findActiveBookingsForChild(input.childId);
      const overlapData = existingBookings.map((b) => ({
        sessionDate: b.session.date,
        sessionTime: b.session.time,
        status: b.status as string,
      }));
      assertNoOverlap(overlapData, { date: session.date, time: session.time });
    }

    // --- Execute booking inside a serializable transaction ---
    // The FOR UPDATE lock inside createWithCapacityLock is the real capacity guard
    const booking = await withTransaction(prisma, async (tx) => {
      return bookingsRepository.createWithCapacityLock(tx, {
        userId,
        sessionId: input.sessionId,
        childId: input.childId,
        price: session.price,
      });
    });

    const response = mapToBookingResponse(booking);

    // --- Cache idempotency response (24h TTL) ---
    if (input.idempotencyKey) {
      await redis.set(
        `idempotency:booking:${input.idempotencyKey}`,
        JSON.stringify(response),
        'EX',
        86400,
      );
    }

    // --- Emit event AFTER transaction commits ---
    eventBus.emit(EventType.BOOKING_CREATED, {
      bookingId: booking.id,
      userId,
      sessionId: input.sessionId,
    });

    return response;
  },

  async cancelBooking(userId: string, bookingId: string): Promise<void> {
    const booking = await bookingsRepository.findByIdAndUserId(bookingId, userId);

    if (!booking) {
      const eventBooking = await bookingsRepository.findEventBookingByIdAndUserId(bookingId, userId);
      if (!eventBooking) {
        throw new AppError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
      }
      if (eventBooking.status === 'CANCELLED') {
        throw new AppError('BOOKING_ALREADY_CANCELLED', 'Booking is already cancelled.', 409);
      }
      if (eventBooking.status === 'REFUNDED') {
        throw new AppError('VALIDATION_ERROR', 'Refunded bookings cannot be cancelled.', 409);
      }
      await bookingsRepository.cancelEventBookingById(bookingId);
      return;
    }

    if (booking.status === 'CANCELLED') {
      throw new AppError('BOOKING_ALREADY_CANCELLED', 'Booking is already cancelled.', 409);
    }
    if (booking.status === 'REFUNDED') {
      throw new AppError('VALIDATION_ERROR', 'Refunded bookings cannot be cancelled.', 409);
    }

    await withTransaction(prisma, async (tx) => {
      return bookingsRepository.cancelById(tx, bookingId, booking.sessionId);
    });

    // --- Emit event AFTER transaction commits ---
    eventBus.emit(EventType.BOOKING_CANCELLED, { bookingId, userId });
  },
};
