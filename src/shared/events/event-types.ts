/**
 * @file event-types.ts
 * @description All event name constants and payload type map. Single registry for the event system.
 * @module src/shared/events/event-types
 */
export const EventType = {
  BOOKING_CREATED: 'booking.created',
  BOOKING_CANCELLED: 'booking.cancelled',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  REFUND_ISSUED: 'refund.issued',
  USER_SIGNED_UP: 'user.signed_up',
} as const;

export type EventName = (typeof EventType)[keyof typeof EventType];

export interface EventPayloadMap {
  [EventType.BOOKING_CREATED]: { bookingId: string; userId: string; sessionId: string };
  [EventType.BOOKING_CANCELLED]: { bookingId: string; userId: string };
  [EventType.PAYMENT_SUCCEEDED]: { paymentId: string; bookingId: string; userId: string };
  [EventType.PAYMENT_FAILED]: { paymentId: string; bookingId: string; userId: string };
  [EventType.REFUND_ISSUED]: { refundId: string; paymentId: string; userId: string };
  [EventType.USER_SIGNED_UP]: { userId: string; email: string; role: string };
}
