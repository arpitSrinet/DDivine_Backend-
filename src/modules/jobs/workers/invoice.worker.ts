/**
 * @file invoice.worker.ts
 * @description BullMQ Worker that processes invoice PDF generation jobs from ddivine-invoice queue.
 * @module src/modules/jobs/workers/invoice.worker
 */
import { Worker } from 'bullmq';

import { getBullMQConnection } from '@/shared/infrastructure/bullmq.js';
import { logger } from '@/shared/infrastructure/logger.js';

import { generateInvoicePdf } from '../processors/generateInvoicePdf.js';
import type { GenerateInvoicePdfJobData } from '../queues/invoice.queue.js';
import { INVOICE_QUEUE_NAME } from '../queues/invoice.queue.js';

export function startInvoiceWorker(): Worker {
  const worker = new Worker(
    INVOICE_QUEUE_NAME,
    async (job) => {
      logger.info({ jobId: job.id, jobName: job.name }, 'Processing invoice job');

      if (job.name === 'generate-pdf') {
        await generateInvoicePdf(job.data as GenerateInvoicePdfJobData);
      } else {
        logger.warn({ jobName: job.name }, 'Unknown invoice job type — skipping');
      }
    },
    { connection: getBullMQConnection() },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Invoice PDF job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Invoice PDF job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Invoice worker error');
  });

  return worker;
}
