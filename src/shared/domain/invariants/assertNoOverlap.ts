/**
 * @file assertNoOverlap.ts
 * @description Asserts a child has no existing confirmed booking for the same date/time slot.
 * @module src/shared/domain/invariants/assertNoOverlap
 */
import { OverlapDetectedError } from '@/shared/domain/errors/OverlapDetectedError.js';

interface ExistingBooking {
  sessionDate: Date;
  sessionTime: string;
  status: string;
}

interface NewSession {
  date: Date;
  time: string;
}

export function assertNoOverlap(
  existingBookings: ExistingBooking[],
  newSession: NewSession,
): void {
  const newDate = newSession.date.toISOString().split('T')[0];

  const hasOverlap = existingBookings.some((booking) => {
    if (booking.status === 'CANCELLED') return false;
    const existingDate = booking.sessionDate.toISOString().split('T')[0];
    return existingDate === newDate && booking.sessionTime === newSession.time;
  });

  if (hasOverlap) {
    throw new OverlapDetectedError(
      'This child already has a booking at the same date and time.',
    );
  }
}
