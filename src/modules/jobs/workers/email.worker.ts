/**
 * @file email.worker.ts
 * @description BullMQ Worker that processes all email jobs from the ddivine-email queue.
 * @module src/modules/jobs/workers/email.worker
 */
import { Worker } from 'bullmq';

import { getBullMQConnection } from '@/shared/infrastructure/bullmq.js';
import { logger } from '@/shared/infrastructure/logger.js';

import { sendBookingConfirmation } from '../processors/sendBookingConfirmation.js';
import {
  sendPaymentConfirmation,
  sendPaymentFailedEmail,
  sendRefundIssuedEmail,
} from '../processors/sendPaymentConfirmation.js';
import type {
  BookingConfirmationJobData,
  EmailJobName,
  PaymentConfirmationJobData,
  PaymentFailedJobData,
  RefundIssuedJobData,
} from '../queues/email.queue.js';
import { EMAIL_QUEUE_NAME } from '../queues/email.queue.js';

export function startEmailWorker(): Worker {
  const worker = new Worker(
    EMAIL_QUEUE_NAME,
    async (job) => {
      const jobName = job.name as EmailJobName;
      logger.info({ jobId: job.id, jobName }, 'Processing email job');

      switch (jobName) {
        case 'booking-confirmation':
          await sendBookingConfirmation(job.data as BookingConfirmationJobData);
          break;
        case 'payment-confirmation':
          await sendPaymentConfirmation(job.data as PaymentConfirmationJobData);
          break;
        case 'payment-failed':
          await sendPaymentFailedEmail(job.data as PaymentFailedJobData);
          break;
        case 'refund-issued':
          await sendRefundIssuedEmail(job.data as RefundIssuedJobData);
          break;
        default:
          logger.warn({ jobName }, 'Unknown email job type — skipping');
      }
    },
    { connection: getBullMQConnection() },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'Email job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Email job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Email worker error');
  });

  return worker;
}
