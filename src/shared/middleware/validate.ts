/**
 * @file validate.ts
 * @description Zod request validation helper. Validates body, params, and querystring against schemas.
 * @module src/shared/middleware/validate
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodSchema } from 'zod';
import { ZodError } from 'zod';

import { AppError } from '@/shared/errors/AppError.js';

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export function validate(schemas: ValidationSchemas) {
  return async function validateHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    try {
      if (schemas.body) {
        request.body = schemas.body.parse(request.body);
      }
      if (schemas.params) {
        (request.params as unknown) = schemas.params.parse(request.params);
      }
      if (schemas.query) {
        (request.query as unknown) = schemas.query.parse(request.query);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldErrors = error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        throw new AppError('VALIDATION_ERROR', 'Invalid request data.', 422, {
          errors: fieldErrors,
        });
      }
      throw error;
    }
  };
}
