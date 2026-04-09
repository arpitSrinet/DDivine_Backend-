/**
 * @file invoice.queue.ts
 * @description BullMQ Queue for invoice PDF generation. Add jobs here; invoice.worker processes them.
 * @module src/modules/jobs/queues/invoice.queue
 */
import { Queue } from 'bullmq';

import {
  assertValidQueueName,
  getBullMQConnection,
} from '@/shared/infrastructure/bullmq.js';

export const INVOICE_QUEUE_NAME = assertValidQueueName('ddivine-invoice');

export const invoiceQueue = new Queue(INVOICE_QUEUE_NAME, {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  },
});

export interface GenerateInvoicePdfJobData {
  invoiceId: string;
  paymentId: string;
  userId: string;
  userEmail: string;
  userFirstName: string;
  userLastName: string;
  amount: number;
  currency: string;
  bookingId: string;
  serviceName: string;
  sessionDate: string;
}
