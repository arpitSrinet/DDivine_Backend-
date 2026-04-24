/**
 * @file email.queue.ts
 * @description BullMQ Queue for outbound emails. Add jobs here; email.worker processes them.
 * @module src/modules/jobs/queues/email.queue
 */
import { Queue } from 'bullmq';

import {
  assertValidQueueName,
  getBullMQConnection,
} from '@/shared/infrastructure/bullmq.js';

export const EMAIL_QUEUE_NAME = assertValidQueueName('ddivine-email');

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

export type EmailJobName =
  | 'booking-confirmation'
  | 'payment-confirmation'
  | 'payment-failed'
  | 'refund-issued';

export interface BookingConfirmationJobData {
  bookingId: string;
  userId: string;
  userEmail: string;
  userFirstName: string;
  serviceName: string;
  sessionDate: string;
  sessionTime: string;
  location: string;
  paymentType: 'STRIPE' | 'GOVERNMENT';
  bookingStatus: 'PENDING_PAYMENT' | 'GOVERNMENT_PAYMENT_PENDING' | 'CONFIRMED';
}

export interface PaymentConfirmationJobData {
  paymentId: string;
  userId: string;
  userEmail: string;
  userFirstName: string;
  amount: number;
  currency: string;
  invoiceId?: string;
}

export interface PaymentFailedJobData {
  paymentId: string;
  userId: string;
  userEmail: string;
  userFirstName: string;
}

export interface RefundIssuedJobData {
  refundId: string;
  paymentId: string;
  userId: string;
  userEmail: string;
  userFirstName: string;
  amount: number;
}
