/**
 * @file admin-bookings.routes.ts
 * @description Admin bookings management (session + event bookings) — list, filter, view.
 * Requires ADMIN role.
 * @module src/modules/admin-bookings/admin-bookings.routes
 */
import { Prisma, type BookingStatus } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];

const BookingIdParamSchema = z.object({ bookingId: z.string().min(1) });
const AdminBookingUpdateBodySchema = z.object({
  status: z.string().min(1),
});

const statusMap: Record<string, string> = {
  PENDING: 'pending_payment',
  PENDING_PAYMENT: 'pending_payment',
  GOVERNMENT_PAYMENT_PENDING: 'government_payment_pending',
  CONFIRMED: 'confirmed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
};

const inputStatusToPrismaStatus: Record<string, BookingStatus> = {
  PENDING: 'PENDING',
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  GOVERNMENT_PAYMENT_PENDING: 'GOVERNMENT_PAYMENT_PENDING',
  CONFIRMED: 'CONFIRMED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
  pending_payment: 'PENDING_PAYMENT',
  government_payment_pending: 'GOVERNMENT_PAYMENT_PENDING',
  confirmed: 'CONFIRMED',
  refunded: 'REFUNDED',
  cancelled: 'CANCELLED',
};

function normalizeStatus(status?: string): BookingStatus | undefined {
  if (!status) return undefined;
  return inputStatusToPrismaStatus[status] ?? inputStatusToPrismaStatus[status.toUpperCase()];
}

function toApiStatus(status: BookingStatus): string {
  return statusMap[status] ?? String(status).toLowerCase();
}

function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  // Prisma.Decimal has toNumber()
  if (typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

function toPence(value: unknown): number {
  return Math.round(toNum(value) * 100);
}

function toDateOnly(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString().split('T')[0] : undefined;
}

function deriveCustomerName(row: {
  fullName: string | null;
  user?: { firstName: string; lastName: string } | null;
}): string {
  const name = row.fullName?.trim();
  if (name) return name;
  const fallback = `${row.user?.firstName ?? ''} ${row.user?.lastName ?? ''}`.trim();
  return fallback || '—';
}

function isDecimalLike(value: unknown): value is { toNumber: () => number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toNumber?: () => number }).toNumber === 'function'
  );
}

/** JSON-safe snapshot: ISO dates, decimals → numbers, drops passwordHash anywhere. */
function jsonSafeDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (isDecimalLike(value)) return value.toNumber();
  if (Array.isArray(value)) return value.map(jsonSafeDeep);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'passwordHash') continue;
      out[k] = jsonSafeDeep(v);
    }
    return out;
  }
  return value;
}

const bookingFullInclude = {
  user: true,
  child: true,
  event: { include: { banner: { select: { id: true, url: true, name: true } } } },
  intent: {
    include: {
      items: {
        include: {
          slot: {
            include: {
              eventDate: {
                include: { event: { include: { banner: { select: { id: true, url: true, name: true } } } } },
              },
            },
          },
          child: true,
        },
      },
    },
  },
  items: {
    include: {
      slot: {
        include: {
          eventDate: {
            include: { event: { include: { banner: { select: { id: true, url: true, name: true } } } } },
          },
        },
      },
      event: { include: { banner: { select: { id: true, url: true, name: true } } } },
      eventDate: true,
      child: true,
    },
  },
} satisfies Prisma.CalendarEventBookingInclude;

async function adminBookingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/bookings', {
    schema: {
      tags: ['Admin'],
      summary: 'List all bookings (session + event) with optional filters and pagination',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          q: { type: 'string', description: 'Search by reference, email, or name' },
          userId: { type: 'string', description: 'Filter by customer/user id' },
          eventId: { type: 'string', description: 'Filter by event id (via items)' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              // Keep list rows flexible; serializer was stripping fields to {}
              // when no explicit item properties were declared.
              items: { type: 'object', additionalProperties: true },
            },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
      },
    },
    preHandler: adminGuard,
    handler: async (
      request: FastifyRequest<{
        Querystring: { status?: string; q?: string; userId?: string; eventId?: string; page?: number; pageSize?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const { status, q, userId, eventId, page = 1 } = request.query;
      const pageSize = Math.min(request.query.pageSize ?? 20, 100);
      const normalizedStatus = normalizeStatus(status);
      const skip = (page - 1) * pageSize;

      const eventWhere: Prisma.CalendarEventBookingWhereInput = {
        ...(normalizedStatus && { status: normalizedStatus }),
        ...(userId && { userId }),
        ...(eventId && {
          items: { some: { eventId } },
        }),
        ...(q && {
          OR: [
            { bookingReference: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
            { fullName: { contains: q, mode: 'insensitive' as const } },
            { user: { email: { contains: q, mode: 'insensitive' as const } } },
            { user: { firstName: { contains: q, mode: 'insensitive' as const } } },
            { user: { lastName: { contains: q, mode: 'insensitive' as const } } },
          ],
        }),
      };

      const sessionWhere: Prisma.BookingWhereInput = {
        ...(normalizedStatus && { status: normalizedStatus }),
        ...(userId && { userId }),
        ...(q && {
          OR: [
            { id: { contains: q, mode: 'insensitive' as const } },
            { user: { email: { contains: q, mode: 'insensitive' as const } } },
            { user: { firstName: { contains: q, mode: 'insensitive' as const } } },
            { user: { lastName: { contains: q, mode: 'insensitive' as const } } },
          ],
        }),
      };

      const includeSessionBookings = !eventId;
      const [eventBookings, eventTotal, sessionBookings, sessionTotal] = await Promise.all([
        prisma.calendarEventBooking.findMany({
          where: eventWhere,
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
            items: {
              include: {
                slot: {
                  include: {
                    eventDate: {
                      include: { event: { select: { id: true, title: true, location: true } } },
                    },
                  },
                },
                child: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.calendarEventBooking.count({ where: eventWhere }),
        includeSessionBookings
          ? prisma.booking.findMany({
              where: sessionWhere,
              include: {
                user: { select: { id: true, email: true, firstName: true, lastName: true } },
                session: {
                  select: {
                    id: true,
                    date: true,
                    time: true,
                    location: true,
                    service: { select: { title: true } },
                  },
                },
                payment: { select: { amount: true, currency: true } },
              },
              orderBy: { createdAt: 'desc' },
            })
          : Promise.resolve([]),
        includeSessionBookings ? prisma.booking.count({ where: sessionWhere }) : Promise.resolve(0),
      ]);

      const rows = [
        ...eventBookings.map((b) => ({
          bookingId: b.id,
          bookingReference: b.bookingReference ?? b.id.toUpperCase().slice(0, 8),
          status: statusMap[b.status] ?? String(b.status).toLowerCase(),
          createdAt: b.createdAt.toISOString(),
          customer: {
            id: b.userId,
            name: deriveCustomerName({ fullName: b.fullName, user: b.user }),
            email: b.email ?? b.user.email,
            phone: b.phone ?? undefined,
          },
          payment: {
            method: b.paymentMethod?.toLowerCase() ?? undefined,
            currency: b.currency,
            subtotal: toPence(b.subtotal),
            addonsTotal: toPence(b.addonsTotal),
            discountTotal: toPence(b.discountTotal),
            serviceFee: toPence(b.serviceFee),
            totalPaid: toPence(b.totalPaid),
            stripeCheckoutSessionId: b.stripeCheckoutSessionId ?? undefined,
            stripePaymentIntentId: b.stripePaymentIntentId ?? undefined,
            taxFreeChildcareRef: b.taxFreeChildcareRef ?? undefined,
          },
          items: b.items.map((item) => ({
            itemId: item.id,
            event: item.slot.eventDate.event,
            date: toDateOnly(item.slot.eventDate.date),
            slot: { startTime: item.slot.startTime, endTime: item.slot.endTime },
            child: item.child
              ? { id: item.child.id, name: `${item.child.firstName} ${item.child.lastName}`.trim() }
              : undefined,
            lineTotals: {
              subtotal: toPence(item.lineSubtotal),
              addonsTotal: toPence(item.lineAddonsTotal),
              serviceFee: toPence(item.lineServiceFee),
              total: toPence(item.lineTotal),
            },
          })),
          receipt: {
            downloadUrl: b.receiptUrl ?? undefined,
          },
        })),
        ...sessionBookings.map((b) => ({
          bookingId: b.id,
          bookingReference: b.id.toUpperCase().slice(0, 8),
          status: statusMap[b.status] ?? String(b.status).toLowerCase(),
          createdAt: b.createdAt.toISOString(),
          customer: {
            id: b.userId,
            name: `${b.user.firstName} ${b.user.lastName}`.trim() || '—',
            email: b.user.email,
          },
          payment: {
            method: b.paymentType.toLowerCase(),
            currency: (b.payment?.currency ?? 'gbp').toUpperCase(),
            totalPaid: toPence(b.payment?.amount ?? b.price),
          },
          items: [
            {
              itemId: `session-${b.id}`,
              event: {
                id: b.session.id,
                title: b.session.service.title,
                location: b.session.location,
              },
              date: toDateOnly(b.session.date),
              slot: { startTime: b.session.time },
            },
          ],
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const total = eventTotal + sessionTotal;
      const pagedRows = rows.slice(skip, skip + pageSize);

      await reply.status(200).send({
        data: pagedRows,
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });

  app.get('/api/v1/admin/bookings/:bookingId', {
    schema: {
      tags: ['Admin'],
      summary: 'Get full EVENT booking detail by ID',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { bookingId: { type: 'string' } } },
      response: { 200: { type: 'object' } },
    },
    preHandler: adminGuard,
    handler: async (request: FastifyRequest<{ Params: { bookingId: string } }>, reply: FastifyReply) => {
      const booking = await prisma.calendarEventBooking.findUnique({
        where: { id: request.params.bookingId },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          items: {
            include: {
              slot: {
                include: {
                  eventDate: {
                    include: { event: { select: { id: true, title: true, location: true } } },
                  },
                },
              },
              child: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });
      if (!booking) throw new AppError('BOOKING_NOT_FOUND', 'Booking not found.', 404);

      await reply.status(200).send({
        bookingId: booking.id,
        bookingReference: booking.bookingReference ?? booking.id.toUpperCase().slice(0, 8),
        status: statusMap[booking.status] ?? String(booking.status).toLowerCase(),
        createdAt: booking.createdAt.toISOString(),
        updatedAt: booking.updatedAt.toISOString(),
        customer: {
          id: booking.userId,
          name: deriveCustomerName({ fullName: booking.fullName, user: booking.user }),
          email: booking.email ?? booking.user.email,
          phone: booking.phone ?? undefined,
        },
        payment: {
          method: booking.paymentMethod?.toLowerCase() ?? undefined,
          currency: booking.currency,
          subtotal: toNum(booking.subtotal),
          addonsTotal: toNum(booking.addonsTotal),
          discountTotal: toNum(booking.discountTotal),
          serviceFee: toNum(booking.serviceFee),
          totalPaid: toNum(booking.totalPaid),
          stripeCheckoutSessionId: booking.stripeCheckoutSessionId ?? undefined,
          stripePaymentIntentId: booking.stripePaymentIntentId ?? undefined,
          receiptUrl: booking.receiptUrl ?? undefined,
          taxFreeChildcareRef: booking.taxFreeChildcareRef ?? undefined,
        },
        items: booking.items.map((item) => ({
          itemId: item.id,
          eventId: item.eventId,
          eventDateId: item.eventDateId,
          slotId: item.slotId,
          event: item.slot.eventDate.event,
          date: toDateOnly(item.slot.eventDate.date),
          slot: { startTime: item.slot.startTime, endTime: item.slot.endTime },
          child: item.child
            ? { id: item.child.id, name: `${item.child.firstName} ${item.child.lastName}`.trim() }
            : undefined,
          medicalNotes: item.medicalNotes ?? undefined,
          lineTotals: {
            subtotal: toNum(item.lineSubtotal),
            addonsTotal: toNum(item.lineAddonsTotal),
            serviceFee: toNum(item.lineServiceFee),
            total: toNum(item.lineTotal),
          },
          createdAt: item.createdAt.toISOString(),
        })),
      });
    },
  });

  app.patch('/api/v1/admin/bookings/:bookingId', {
    schema: {
      tags: ['Admin'],
      summary: 'Update booking status by ID (event or session booking)',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { bookingId: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            bookingId: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
    },
    preHandler: [
      ...adminGuard,
      validate({ params: BookingIdParamSchema, body: AdminBookingUpdateBodySchema }),
    ],
    handler: async (
      request: FastifyRequest<{ Params: { bookingId: string }; Body: { status: string } }>,
      reply: FastifyReply,
    ) => {
      const { bookingId } = request.params;
      const normalizedStatus = normalizeStatus(request.body.status);
      if (!normalizedStatus) {
        throw new AppError('VALIDATION_ERROR', 'Invalid booking status.', 400);
      }

      const cancelledAt = normalizedStatus === 'CANCELLED' ? new Date() : null;
      const updateData = { status: normalizedStatus, cancelledAt };

      try {
        const eventBooking = await prisma.calendarEventBooking.update({
          where: { id: bookingId },
          data: updateData,
        });
        await reply.status(200).send({
          bookingId: eventBooking.id,
          status: toApiStatus(eventBooking.status),
        });
        return;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2025') {
          throw error;
        }
      }

      try {
        const sessionBooking = await prisma.booking.update({
          where: { id: bookingId },
          data: updateData,
        });
        await reply.status(200).send({
          bookingId: sessionBooking.id,
          status: toApiStatus(sessionBooking.status),
        });
        return;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2025') {
          throw error;
        }
      }

      throw new AppError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
    },
  });

  app.delete('/api/v1/admin/bookings/:bookingId', {
    schema: {
      tags: ['Admin'],
      summary: 'Cancel (soft delete) booking by ID (event or session booking)',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { bookingId: { type: 'string' } } },
      response: { 204: { type: 'null' } },
    },
    preHandler: [...adminGuard, validate({ params: BookingIdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: { bookingId: string } }>, reply: FastifyReply) => {
      const { bookingId } = request.params;
      const cancelData = { status: 'CANCELLED' as BookingStatus, cancelledAt: new Date() };

      try {
        await prisma.calendarEventBooking.update({
          where: { id: bookingId },
          data: cancelData,
        });
        await reply.status(204).send();
        return;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2025') {
          throw error;
        }
      }

      try {
        await prisma.booking.update({
          where: { id: bookingId },
          data: cancelData,
        });
        await reply.status(204).send();
        return;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2025') {
          throw error;
        }
      }

      throw new AppError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
    },
  });

  async function sendBookingFull(
    request: FastifyRequest<{ Params: { bookingId: string } }>,
    reply: FastifyReply,
  ) {
    const row = await prisma.calendarEventBooking.findUnique({
      where: { id: request.params.bookingId },
      include: bookingFullInclude,
    });
    if (!row) throw new AppError('BOOKING_NOT_FOUND', 'Booking not found.', 404);

    await reply.status(200).send({
      data: jsonSafeDeep(row),
    });
  }

  app.get('/api/v1/admin/bookings/:bookingId/full', {
    schema: {
      tags: ['Admin'],
      summary: 'Get EVENT booking with all DB fields and relations (admin)',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { bookingId: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { data: { type: 'object' } } } },
    },
    preHandler: [...adminGuard, validate({ params: BookingIdParamSchema })],
    handler: sendBookingFull,
  });

  app.get('/api/v2/admin/bookings/:bookingId/full', {
    schema: {
      tags: ['Admin'],
      summary: 'Get EVENT booking with all DB fields and relations (admin, v2 path)',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { bookingId: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { data: { type: 'object' } } } },
    },
    preHandler: [...adminGuard, validate({ params: BookingIdParamSchema })],
    handler: sendBookingFull,
  });
}

export default fp(adminBookingsRoutes, { name: 'admin-bookings-routes' });
