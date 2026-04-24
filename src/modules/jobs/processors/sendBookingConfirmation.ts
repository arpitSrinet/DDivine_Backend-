/**
 * @file sendBookingConfirmation.ts
 * @description Processor: sends booking confirmation email to parent.
 * @module src/modules/jobs/processors/sendBookingConfirmation
 */
import nodemailer from 'nodemailer';

import { env } from '@/config/env.js';
import { logger } from '@/shared/infrastructure/logger.js';

import type { BookingConfirmationJobData } from '../queues/email.queue.js';

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

export async function sendBookingConfirmation(data: BookingConfirmationJobData): Promise<void> {
  if (!env.SMTP_HOST) {
    logger.warn({ bookingId: data.bookingId }, 'SMTP not configured — skipping booking confirmation email');
    return;
  }

  const transporter = getTransporter();

  const isGovernment = data.paymentType === 'GOVERNMENT';
  const isConfirmed = data.bookingStatus === 'CONFIRMED';
  const heading = isConfirmed ? 'Booking Confirmed!' : 'Booking Created';
  const subjectPrefix = isConfirmed ? 'Booking Confirmed' : 'Booking Created';
  const paymentCopy = isConfirmed
    ? '<p>Your booking is confirmed.</p>'
    : isGovernment
      ? `<p>Your booking has been created and is awaiting government payment.</p>
         <p>We have generated an invoice for you to use for TFC / UC payment.</p>`
      : `<p>Your booking has been created and is awaiting payment.</p>
         <p>Please complete payment to confirm your booking.</p>`;

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: data.userEmail,
    subject: `${subjectPrefix} — ${data.serviceName}`,
    html: `
      <h2>${heading}</h2>
      <p>Hi ${data.userFirstName},</p>
      ${paymentCopy}
      <p>Here are the details:</p>
      <table>
        <tr><td><strong>Service:</strong></td><td>${data.serviceName}</td></tr>
        <tr><td><strong>Date:</strong></td><td>${data.sessionDate}</td></tr>
        <tr><td><strong>Time:</strong></td><td>${data.sessionTime}</td></tr>
        <tr><td><strong>Location:</strong></td><td>${data.location}</td></tr>
      </table>
      <p>Reference: ${data.bookingId}</p>
      <p>Thank you for booking with DDivine Training!</p>
    `,
  });

  logger.info({ bookingId: data.bookingId, to: data.userEmail }, 'Booking confirmation email sent');
}
