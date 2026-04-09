/**
 * @file errorHandler.ts
 * @description Fastify error handler plugin. Converts AppError instances into the locked error envelope shape.
 * @module src/shared/errors/errorHandler
 */
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { logger } from '@/shared/infrastructure/logger.js';

import { AppError } from './AppError.js';

async function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const requestId = (request.headers['x-request-id'] as string) ?? 'unknown';

  if (error instanceof AppError) {
    logger.warn(
      { code: error.code, statusCode: error.statusCode, requestId },
      error.message,
    );

    const payload: Record<string, unknown> = {
      code: error.code,
      message: error.message,
      status: error.statusCode,
    };

    if (error.errors && error.errors.length > 0) {
      payload.errors = error.errors;
    }

    if (error.retryAfter !== undefined) {
      payload.retryAfter = error.retryAfter;
      void reply.header('Retry-After', String(error.retryAfter));
    }

    await reply.status(error.statusCode).send(payload);
    return;
  }

  // Fastify's built-in validation errors (FST_ERR_VALIDATION) carry a statusCode
  // of 400 and should be surfaced as client errors, not masked as server errors.
  const fastifyError = error as FastifyError;
  if (fastifyError.statusCode && fastifyError.statusCode < 500) {
    logger.warn({ err: error, requestId }, 'Validation error');
    await reply.status(fastifyError.statusCode).send({
      code: 'VALIDATION_ERROR',
      message: fastifyError.message,
      status: fastifyError.statusCode,
    });
    return;
  }

  logger.error({ err: error, requestId }, 'Unhandled error');

  await reply.status(500).send({
    code: 'SERVER_ERROR',
    message: 'An unexpected error occurred.',
    status: 500,
  });
}

export default fp(
  async (fastify) => {
    fastify.setErrorHandler(errorHandler);
  },
  { name: 'error-handler' },
);
