/**
 * @file xero.queue.ts
 * @description BullMQ Queue for Xero background jobs (government / TFC invoice sync).
 * @module src/modules/jobs/queues/xero.queue
 */
import { Queue } from 'bullmq';

import {
  assertValidQueueName,
  getBullMQConnection,
} from '@/shared/infrastructure/bullmq.js';

export const XERO_QUEUE_NAME = assertValidQueueName('ddivine-xero');

export const xeroQueue = new Queue(XERO_QUEUE_NAME, {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

export type XeroJobName = 'sync-government-pending';
