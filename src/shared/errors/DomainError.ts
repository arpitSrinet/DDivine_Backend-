/**
 * @file DomainError.ts
 * @description Base class for domain rule violation errors. Extends AppError.
 * @module src/shared/errors/DomainError
 */
import { AppError } from './AppError.js';
import type { IFieldError } from './AppError.js';

export class DomainError extends AppError {
  constructor(
    code: string,
    message: string,
    statusCode: number = 422,
    options?: { errors?: IFieldError[] },
  ) {
    super(code, message, statusCode, options);
    this.name = 'DomainError';
  }
}
