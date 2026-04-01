/**
 * @file Postcode.ts
 * @description UK postcode value object. Validates format and normalises to uppercase.
 * @module src/shared/domain/value-objects/Postcode
 */
import { DomainError } from '@/shared/errors/DomainError.js';

const UK_POSTCODE_REGEX =
  /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i;

export function validatePostcode(raw: string): string {
  const trimmed = raw.trim();
  if (!UK_POSTCODE_REGEX.test(trimmed)) {
    throw new DomainError('VALIDATION_ERROR', 'Invalid UK postcode.', 422, {
      errors: [{ field: 'postcode', message: 'Must be a valid UK postcode.' }],
    });
  }
  return trimmed.toUpperCase();
}
