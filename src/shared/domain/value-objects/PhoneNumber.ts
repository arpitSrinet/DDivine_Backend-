/**
 * @file PhoneNumber.ts
 * @description UK phone number value object. Validates against UK format.
 * @module src/shared/domain/value-objects/PhoneNumber
 */
import { DomainError } from '@/shared/errors/DomainError.js';

const UK_PHONE_REGEX = /^(\+44|0)[0-9]{10}$/;

export function validatePhoneNumber(raw: string): string {
  const cleaned = raw.replace(/\s+/g, '');
  if (!UK_PHONE_REGEX.test(cleaned)) {
    throw new DomainError('VALIDATION_ERROR', 'Invalid UK phone number.', 422, {
      errors: [{ field: 'phone', message: 'Must be a valid UK phone number.' }],
    });
  }
  return cleaned;
}
