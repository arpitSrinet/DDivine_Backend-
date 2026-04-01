/**
 * @file OverlapDetectedError.ts
 * @description Thrown when a booking conflicts with an existing booking for the same child/time.
 * @module src/shared/domain/errors/OverlapDetectedError
 */
import { DomainError } from '@/shared/errors/DomainError.js';

export class OverlapDetectedError extends DomainError {
  constructor(message: string = 'Booking overlaps with an existing booking.') {
    super('BOOKING_OVERLAP', message, 409);
    this.name = 'OverlapDetectedError';
  }
}
