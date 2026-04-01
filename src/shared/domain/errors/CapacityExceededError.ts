/**
 * @file CapacityExceededError.ts
 * @description Thrown when a session has no remaining capacity.
 * @module src/shared/domain/errors/CapacityExceededError
 */
import { DomainError } from '@/shared/errors/DomainError.js';

export class CapacityExceededError extends DomainError {
  constructor(message: string = 'Session capacity exceeded.') {
    super('CAPACITY_EXCEEDED', message, 409);
    this.name = 'CapacityExceededError';
  }
}
