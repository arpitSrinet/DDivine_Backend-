/**
 * @file rateLimiter.ts
 * @description Redis sliding-window rate limiter middleware factory.
 * @module src/shared/middleware/rateLimiter
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '@/shared/errors/AppError.js';
import { redis } from '@/shared/infrastructure/redis.js';

interface RateLimitOptions {
  max: number;
  windowSeconds: number;
  keyPrefix?: string;
}

export function rateLimiter(options: RateLimitOptions) {
  const { max, windowSeconds, keyPrefix = 'rl' } = options;

  return async function rateLimitHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const identifier = request.ip;
    const key = `${keyPrefix}:${request.routeOptions.url}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, `${now}:${Math.random()}`);
    pipeline.zcard(key);
    pipeline.expire(key, windowSeconds);
    const results = await pipeline.exec();

    const count = results?.[2]?.[1] as number | undefined;

    if (count !== undefined && count > max) {
      throw new AppError('RATE_LIMITED', `Too many attempts. Please try again later.`, 429, {
        retryAfter: windowSeconds,
      });
    }
  };
}
