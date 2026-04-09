/**
 * @file sendPaymentConfirmation.ts
 * @description Processor: sends payment confirmation and failure emails to parent.
 * @module src/modules/jobs/processors/sendPaymentConfirmation
 */
import nodemailer from 'nodemailer';

import { env } from '@/config/env.js';
import { logger } from '@/shared/infrastructure/logger.js';

import type { PaymentConfirmationJobData, PaymentFailedJobData, RefundIssuedJobData } from '../queues/email.queue.js';

function getTransporter() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
  });
}

export async function sendPaymentConfirmation(data: PaymentConfirmationJobData): Promise<void> {
  if (!env.SMTP_HOST) {
    logger.warn({ paymentId: data.paymentId }, 'SMTP not configured — skipping payment confirmation email');
    return;
  }

  const amountFormatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: data.currency.toUpperCase(),
  }).format(data.amount);

  const transporter = getTransporter();

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: data.userEmail,
    subject: 'Payment Received — DDivine Training',
    html: `
      <h2>Payment Confirmed</h2>
      <p>Hi ${data.userFirstName},</p>
      <p>We have received your payment of <strong>${amountFormatted}</strong>.</p>
      <p>Payment reference: ${data.paymentId}</p>
      ${data.invoiceId ? `<p>Your invoice (ref: ${data.invoiceId}) has been generated and is available in your account.</p>` : ''}
      <p>Thank you for choosing DDivine Training!</p>
    `,
  });

  logger.info({ paymentId: data.paymentId, to: data.userEmail }, 'Payment confirmation email sent');
}

export async function sendPaymentFailedEmail(data: PaymentFailedJobData): Promise<void> {
  if (!env.SMTP_HOST) {
    logger.warn({ paymentId: data.paymentId }, 'SMTP not configured — skipping payment failed email');
    return;
  }

  const transporter = getTransporter();

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: data.userEmail,
    subject: 'Payment Failed — DDivine Training',
    html: `
      <h2>Payment Failed</h2>
      <p>Hi ${data.userFirstName},</p>
      <p>Unfortunately, your payment could not be processed (ref: ${data.paymentId}).</p>
      <p>Please try again or contact us for assistance.</p>
    `,
  });

  logger.info({ paymentId: data.paymentId, to: data.userEmail }, 'Payment failed email sent');
}

export async function sendRefundIssuedEmail(data: RefundIssuedJobData): Promise<void> {
  if (!env.SMTP_HOST) {
    logger.warn({ refundId: data.refundId }, 'SMTP not configured — skipping refund email');
    return;
  }

  const amountFormatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(data.amount);

  const transporter = getTransporter();

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: data.userEmail,
    subject: 'Refund Processed — DDivine Training',
    html: `
      <h2>Refund Processed</h2>
      <p>Hi ${data.userFirstName},</p>
      <p>Your refund of <strong>${amountFormatted}</strong> has been processed.</p>
      <p>Refund reference: ${data.refundId}</p>
      <p>Please allow 3–5 business days for the funds to appear in your account.</p>
    `,
  });

  logger.info({ refundId: data.refundId, to: data.userEmail }, 'Refund email sent');
}
