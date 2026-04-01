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
 *   PENDING   → 'pending'
 *   CONFIRMED → 'confirmed'
 *   CANCELLED → 'cancelled'
 *
 * @module src/modules/bookings/bookings.schema
 */
import { z } from 'zod';
import type { BookingStatus } from '@prisma/client';

export const BOOKING_STATUS_MAP: Record<BookingStatus, 'pending' | 'confirmed' | 'cancelled'> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
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
  serviceName: z.string(),
  date: z.string(),
  time: z.string(),
  location: z.string(),
  status: z.enum(['confirmed', 'pending', 'cancelled']),
  coachName: z.string().optional(),
  price: z.number().nonnegative().optional(),
});

export type IBookingIdParam = z.infer<typeof BookingIdParamSchema>;
export type ICreateBooking = z.infer<typeof CreateBookingSchema>;
export type IBookingResponse = z.infer<typeof BookingResponseSchema>;
