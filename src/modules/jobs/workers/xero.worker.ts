/**
 * @file xero.worker.ts
 * @description BullMQ Worker that processes Xero background jobs.
 *   Currently handles: sync-government-pending (replaces the setInterval approach).
 *   The repeatable job is registered in app.ts so only one instance schedules it,
 *   but every worker instance competes to process — only one wins per tick (BullMQ
 *   distributed lock), making this safe for multi-instance deployments.
 * @module src/modules/jobs/workers/xero.worker
 */
import { Worker } from 'bullmq';

import { xeroService } from '@/modules/xero/xero.service.js';
import { getBullMQConnection } from '@/shared/infrastructure/bullmq.js';
import { logger } from '@/shared/infrastructure/logger.js';

import { XERO_QUEUE_NAME } from '../queues/xero.queue.js';

export function startXeroWorker(): Worker {
  const worker = new Worker(
    XERO_QUEUE_NAME,
    async (job) => {
      if (job.name === 'sync-government-pending') {
        const result = await xeroService.syncGovernmentPendingBookings();
        if (result.synced > 0) {
          logger.info({ synced: result.synced }, 'Xero government booking sync completed');
        }
      } else {
        logger.warn({ jobName: job.name }, 'Unknown Xero job type — skipping');
      }
    },
    { connection: getBullMQConnection() },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Xero job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Xero worker error');
  });

  return worker;
}
