/**
 * @file DateOfBirth.ts
 * @description Date of birth value object. Validates that it is in the past and derives age.
 * @module src/shared/domain/value-objects/DateOfBirth
 */
import { DomainError } from '@/shared/errors/DomainError.js';

export function validateDateOfBirth(raw: string | Date): Date {
  const date = raw instanceof Date ? raw : new Date(raw);

  if (isNaN(date.getTime())) {
    throw new DomainError('VALIDATION_ERROR', 'Invalid date of birth.', 422, {
      errors: [{ field: 'dateOfBirth', message: 'Must be a valid date.' }],
    });
  }

  if (date >= new Date()) {
    throw new DomainError('VALIDATION_ERROR', 'Date of birth must be in the past.', 422, {
      errors: [{ field: 'dateOfBirth', message: 'Must be a date in the past.' }],
    });
  }

  return date;
}

export function calculateAgeAtDate(dateOfBirth: Date, referenceDate: Date): number {
  let age = referenceDate.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = referenceDate.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
}
