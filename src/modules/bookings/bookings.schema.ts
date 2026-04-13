/**
 * @file bookings.schema.ts
 * @description Zod schemas for booking endpoints. Matches locked frontend contract (Section 8.4).
 *
 * Endpoints:
 *   GET    /api/v1/bookings/mine         → response: BookingResponse[]
 *   GET    /api/v1/bookings/:bookingId   → response: BookingResponse
 *   DELETE /api/v1/bookings/:bookingId   → response: 204
 *   POST   /api/v1/bookings              → body: CreateBookingSchema → response: BookingResponse
 *
 * BookingStatus enum map (Prisma → API):
 *   PENDING                    → 'pending_payment' (legacy rows)
 *   PENDING_PAYMENT            → 'pending_payment'
 *   GOVERNMENT_PAYMENT_PENDING → 'government_payment_pending'
 *   CONFIRMED                  → 'confirmed'
 *   REFUNDED                   → 'refunded'
 *   CANCELLED                  → 'cancelled'
 *
 * @module src/modules/bookings/bookings.schema
 */
import { z } from 'zod';
import type { BookingStatus } from '@prisma/client';

export const BOOKING_STATUS_MAP: Record<
  BookingStatus,
  'pending_payment' | 'government_payment_pending' | 'confirmed' | 'refunded' | 'cancelled'
> = {
  PENDING: 'pending_payment',
  PENDING_PAYMENT: 'pending_payment',
  GOVERNMENT_PAYMENT_PENDING: 'government_payment_pending',
  CONFIRMED: 'confirmed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
};

export const BookingIdParamSchema = z.object({
  bookingId: z.string().min(1),
});

export const CreateBookingSchema = z.object({
  sessionId: z.string().min(1),
  childId: z.string().min(1).optional(),
  idempotencyKey: z.string().optional(),
});

export const BookingResponseSchema = z.object({
  id: z.string(),
  bookingType: z.enum(['session', 'event']).optional(),
  bookingReference: z.string().optional(),
  serviceName: z.string(),
  date: z.string(),
  time: z.string(),
  location: z.string(),
  status: z.enum([
    'pending_payment',
    'government_payment_pending',
    'confirmed',
    'refunded',
    'cancelled',
  ]),
  coachName: z.string().optional(),
  price: z.number().nonnegative().optional(),
  attendee: z
    .object({
      childId: z.string().nullable().optional(),
      childName: z.string().optional(),
    })
    .optional(),
  contact: z
    .object({
      fullName: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional(),
  payment: z
    .object({
      method: z.string().optional(),
      currency: z.string().optional(),
      subtotal: z.number().optional(),
      addonsTotal: z.number().optional(),
      discountTotal: z.number().optional(),
      serviceFee: z.number().optional(),
      totalPaid: z.number().optional(),
    })
    .optional(),
  receipt: z
    .object({
      downloadUrl: z.string().optional(),
    })
    .optional(),
});

export type IBookingIdParam = z.infer<typeof BookingIdParamSchema>;
export type ICreateBooking = z.infer<typeof CreateBookingSchema>;
export type IBookingResponse = z.infer<typeof BookingResponseSchema>;
