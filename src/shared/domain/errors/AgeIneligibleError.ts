/**
 * @file AgeIneligibleError.ts
 * @description Thrown when a child's age does not meet session eligibility requirements.
 * @module src/shared/domain/errors/AgeIneligibleError
 */
import { DomainError } from '@/shared/errors/DomainError.js';

export class AgeIneligibleError extends DomainError {
  constructor(message: string = 'Child does not meet age requirements.') {
    super('AGE_INELIGIBLE', message, 422);
    this.name = 'AgeIneligibleError';
  }
}
