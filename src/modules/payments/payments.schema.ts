/**
 * @file payments.schema.ts
 * @description Zod schemas for payment endpoints.
 *
 * Endpoints:
 *   POST /api/v1/payments/create-intent  → body: CreatePaymentIntentSchema → response: PaymentIntentResponse
 *   POST /api/v1/payments/webhook        → raw body (Stripe webhook) → response: 200
 *   GET  /api/v1/payments/:paymentId     → response: PaymentResponse
 *
 * PaymentStatus enum map (Prisma → API):
 *   PENDING  → 'pending'
 *   PAID     → 'paid'
 *   REFUNDED → 'refunded'
 *   FAILED   → 'failed'
 *
 * @module src/modules/payments/payments.schema
 */
import { z } from 'zod';
import type { PaymentStatus } from '@prisma/client';

export const PAYMENT_STATUS_MAP: Record<PaymentStatus, string> = {
  PENDING: 'pending',
  PAID: 'paid',
  REFUNDED: 'refunded',
  FAILED: 'failed',
};

export const CreatePaymentIntentSchema = z.object({
  bookingId: z.string().min(1),
});

export const PaymentIdParamSchema = z.object({
  paymentId: z.string().min(1),
});

export const PaymentResponseSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  amount: z.number().nonnegative(),
  currency: z.string(),
  status: z.enum(['pending', 'paid', 'refunded', 'failed']),
  stripePaymentIntentId: z.string(),
});

export const PaymentIntentResponseSchema = z.object({
  clientSecret: z.string(),
  paymentId: z.string(),
  amount: z.number(),
  currency: z.string(),
});

export type ICreatePaymentIntent = z.infer<typeof CreatePaymentIntentSchema>;
export type IPaymentIdParam = z.infer<typeof PaymentIdParamSchema>;
export type IPaymentResponse = z.infer<typeof PaymentResponseSchema>;
export type IPaymentIntentResponse = z.infer<typeof PaymentIntentResponseSchema>;
