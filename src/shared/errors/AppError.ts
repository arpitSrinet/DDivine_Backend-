/**
 * @file AppError.ts
 * @description Base typed error class for all application errors. Maps directly to the locked error envelope.
 * @module src/shared/errors/AppError
 */
export interface IFieldError {
  field: string;
  message: string;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly errors?: IFieldError[];
  public readonly retryAfter?: number;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    options?: { errors?: IFieldError[]; retryAfter?: number },
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.errors = options?.errors;
    this.retryAfter = options?.retryAfter;
  }
}
