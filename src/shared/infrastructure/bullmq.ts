/**
 * @file bullmq.ts
 * @description BullMQ connection factory. Creates fresh ioredis connection options from REDIS_URL.
 * Workers require maxRetriesPerRequest: null for blocking Redis commands.
 * @module src/shared/infrastructure/bullmq
 */
import type { ConnectionOptions } from 'bullmq';

import { env } from '@/config/env.js';

/**
 * BullMQ reserves ":" internally in Redis keys, so queue names must not include it.
 * This guard gives a clear startup error before BullMQ throws a generic one.
 */
export function assertValidQueueName(queueName: string): string {
  if (queueName.includes(':')) {
    throw new Error(`Invalid BullMQ queue name "${queueName}": ":" is not allowed`);
  }
  return queueName;
}

export function getBullMQConnection(): ConnectionOptions {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    password: url.password || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}
