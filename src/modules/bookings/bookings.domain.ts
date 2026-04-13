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
    bookingType: 'session',
    serviceName: booking.session.service.title,
    date: dateOnly,
    time: booking.session.time,
    location: booking.session.location,
    status: BOOKING_STATUS_MAP[booking.status],
    ...(booking.session.coachName && { coachName: booking.session.coachName }),
    ...(booking.price && { price: booking.price.toNumber() }),
  };
}

type EventBookingWithRelations = Prisma.CalendarEventBookingGetPayload<{
  include: {
    event: true;
    child: {
      select: {
        firstName: true;
        lastName: true;
      };
    };
  };
}>;

function toDateOnly(value: Date | null | undefined): string {
  return (value ?? new Date()).toISOString().split('T')[0];
}

function getEventDateRange(booking: EventBookingWithRelations) {
  const start = booking.event.startDate ?? booking.event.date;
  const end = booking.event.endDate ?? start;
  return {
    start: toDateOnly(start),
    end: toDateOnly(end),
  };
}

function getEventTimeRange(booking: EventBookingWithRelations) {
  const start = booking.event.startTime ?? booking.event.time;
  const end = booking.event.endTime;
  return end ? `${start} - ${end}` : start;
}

export function mapEventBookingToBookingResponse(
  booking: EventBookingWithRelations,
  options?: { includeDetail?: boolean },
): IBookingResponse {
  const { start } = getEventDateRange(booking);
  const response: IBookingResponse = {
    id: booking.id,
    bookingType: 'event',
    ...(booking.bookingReference ? { bookingReference: booking.bookingReference } : {}),
    serviceName: booking.event.title,
    date: start,
    time: getEventTimeRange(booking),
    location: booking.event.location,
    status: BOOKING_STATUS_MAP[booking.status],
    price: booking.totalPaid.toNumber(),
  };

  if (!options?.includeDetail) {
    return response;
  }

  return {
    ...response,
    attendee: {
      childId: booking.childId,
      ...(booking.child ? { childName: `${booking.child.firstName} ${booking.child.lastName}` } : {}),
    },
    contact: {
      ...(booking.fullName ? { fullName: booking.fullName } : {}),
      ...(booking.email ? { email: booking.email } : {}),
      ...(booking.phone ? { phone: booking.phone } : {}),
    },
    payment: {
      ...(booking.paymentMethod ? { method: booking.paymentMethod.toLowerCase() } : {}),
      currency: booking.currency,
      subtotal: booking.subtotal.toNumber(),
      addonsTotal: booking.addonsTotal.toNumber(),
      discountTotal: booking.discountTotal.toNumber(),
      serviceFee: booking.serviceFee.toNumber(),
      totalPaid: booking.totalPaid.toNumber(),
    },
    receipt: {
      downloadUrl: booking.receiptUrl ?? undefined,
    },
  };
}
