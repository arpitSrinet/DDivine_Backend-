/**
 * @file notifications.schema.ts
 * @description Zod schemas for notifications endpoints.
 *
 * Endpoints:
 *   GET   /api/v1/notifications              → response: NotificationResponse[]
 *   PATCH /api/v1/notifications/:id/read     → response: NotificationResponse
 *   PATCH /api/v1/notifications/read-all     → response: { message: string }
 *
 * @module src/modules/notifications/notifications.schema
 */
import { z } from 'zod';

export const NotificationIdParamSchema = z.object({
  notificationId: z.string().min(1),
});

export const NotificationResponseSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  isRead: z.boolean(),
  createdAt: z.string(),
});

export type INotificationIdParam = z.infer<typeof NotificationIdParamSchema>;
export type INotificationResponse = z.infer<typeof NotificationResponseSchema>;

export const NOTIFICATION_TYPES = {
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  REFUND_ISSUED: 'REFUND_ISSUED',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
