/**
 * @file bookings.domain.ts
 * @description Pure domain logic for bookings. Maps Prisma model to locked API response shape.
 * @module src/modules/bookings/bookings.domain
 */
import type { Prisma } from '@prisma/client';

import { BOOKING_STATUS_MAP } from './bookings.schema.js';
import type { IBookingResponse } from './bookings.schema.js';

type BookingWithRelations = Prisma.BookingGetPayload<{
  include: {
    session: {
      include: { service: { select: { title: true } } };
    };
  };
}>;

export function mapToBookingResponse(booking: BookingWithRelations): IBookingResponse {
  const dateOnly = booking.session.date.toISOString().split('T')[0];
  return {
    id: booking.id,
    serviceName: booking.session.service.title,
    date: dateOnly,
    time: booking.session.time,
    location: booking.session.location,
    status: BOOKING_STATUS_MAP[booking.status],
    ...(booking.session.coachName && { coachName: booking.session.coachName }),
    ...(booking.price && { price: booking.price.toNumber() }),
  };
}
