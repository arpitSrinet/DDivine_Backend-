/**
 * @file assertCapacityAvailable.ts
 * @description Asserts a session has remaining capacity for a new booking.
 * @module src/shared/domain/invariants/assertCapacityAvailable
 */
import { CapacityExceededError } from '@/shared/domain/errors/CapacityExceededError.js';

interface SessionCapacity {
  currentCapacity: number;
  maxCapacity: number;
}

export function assertCapacityAvailable(session: SessionCapacity): void {
  if (session.currentCapacity >= session.maxCapacity) {
    throw new CapacityExceededError('This session is fully booked.');
  }
}
