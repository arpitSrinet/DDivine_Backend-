/**
 * @file Email.ts
 * @description Email value object. Validates format, normalises to lowercase + trimmed.
 * @module src/shared/domain/value-objects/Email
 */
import { z } from 'zod';

import { DomainError } from '@/shared/errors/DomainError.js';

const emailSchema = z.string().email();

export function validateEmail(raw: string): string {
  const result = emailSchema.safeParse(raw);
  if (!result.success) {
    throw new DomainError('VALIDATION_ERROR', 'Invalid email format.', 422, {
      errors: [{ field: 'email', message: 'Must be a valid email address.' }],
    });
  }
  return result.data.toLowerCase().trim();
}
