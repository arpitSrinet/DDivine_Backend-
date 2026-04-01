/**
 * @file EmergencyContactMissingError.ts
 * @description Thrown when a child is created without any emergency contact.
 * @module src/shared/domain/errors/EmergencyContactMissingError
 */
import { DomainError } from '@/shared/errors/DomainError.js';

export class EmergencyContactMissingError extends DomainError {
  constructor(message: string = 'At least one emergency contact is required.') {
    super('EMERGENCY_CONTACT_REQUIRED', message, 422);
    this.name = 'EmergencyContactMissingError';
  }
}
