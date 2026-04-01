/**
 * @file refunds.schema.ts
 * @description Zod schemas for refund endpoints.
 *
 * Endpoints:
 *   POST /api/v1/refunds            → body: CreateRefundSchema → response: RefundResponse
 *   GET  /api/v1/refunds/:refundId  → response: RefundResponse
 *
 * @module src/modules/refunds/refunds.schema
 */
import { z } from 'zod';
import type { RefundStatus } from '@prisma/client';

export const REFUND_STATUS_MAP: Record<RefundStatus, string> = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const CreateRefundSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.number().positive('Refund amount must be positive'),
  reason: z.string().min(1, 'Reason is required'),
});

export const RefundIdParamSchema = z.object({
  refundId: z.string().min(1),
});

export const RefundResponseSchema = z.object({
  id: z.string(),
  paymentId: z.string(),
  amount: z.number().nonnegative(),
  reason: z.string(),
  status: z.enum(['pending', 'completed', 'failed']),
  createdAt: z.string(),
});

export type ICreateRefund = z.infer<typeof CreateRefundSchema>;
export type IRefundIdParam = z.infer<typeof RefundIdParamSchema>;
export type IRefundResponse = z.infer<typeof RefundResponseSchema>;
