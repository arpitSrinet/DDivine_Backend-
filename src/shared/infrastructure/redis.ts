/**
 * @file redis.ts
 * @description ioredis client singleton for caching, rate limiting, and token blacklist.
 * @module src/shared/infrastructure/redis
 */
import Redis from 'ioredis';

import { env } from '@/config/env.js';
import { logger } from '@/shared/infrastructure/logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});
