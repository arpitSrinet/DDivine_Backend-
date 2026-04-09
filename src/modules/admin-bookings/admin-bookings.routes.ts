/**
 * @file admin-bookings.routes.ts
 * @description Admin bookings management — list, filter, view, update. Requires ADMIN role.
 * @module src/modules/admin-bookings/admin-bookings.routes
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { BOOKING_STATUS_MAP } from '@/modules/bookings/bookings.schema.js';
import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];

const BookingIdParamSchema = z.object({ bookingId: z.string().min(1) });
const UpdateBookingSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']),
});

const bookingSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    customerId: { type: 'string' },
    customerName: { type: 'string' },
    childId: { type: 'string' },
    childName: { type: 'string' },
    sessionId: { type: 'string' },
    sessionTitle: { type: 'string' },
    date: { type: 'string' },
    time: { type: 'string' },
    location: { type: 'string' },
    status: { type: 'string', enum: ['confirmed', 'pending', 'cancelled'] },
    pricePence: { type: 'integer' },
    createdAt: { type: 'string' },
  },
};

async function adminBookingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/bookings', {
    schema: {
      tags: ['Admin'],
      summary: 'List all bookings with optional filters and pagination',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'CANCELLED'] },
          userId: { type: 'string' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: bookingSchema },
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
      request: FastifyRequest<{ Querystring: { status?: string; userId?: string; page?: number; pageSize?: number } }>,
      reply: FastifyReply,
    ) => {
      const { status, userId, page = 1 } = request.query;
      const pageSize = Math.min(request.query.pageSize ?? 20, 100);
      const skip = (page - 1) * pageSize;

      const where = {
        ...(status && { status: status as 'PENDING' | 'CONFIRMED' | 'CANCELLED' }),
        ...(userId && { userId }),
      };

      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          include: {
            session: { include: { service: true } },
            user: true,
            child: true,
          },
          skip,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.booking.count({ where }),
      ]);

      await reply.status(200).send({
        data: bookings.map((b) => ({
          id: b.id,
          customerId: b.userId,
          customerName: `${b.user.firstName} ${b.user.lastName}`.trim(),
          childId: b.childId ?? '',
          childName: b.child ? `${b.child.firstName} ${b.child.lastName}`.trim() : '',
          sessionId: b.sessionId,
          sessionTitle: b.session.service.title,
          date: b.session.date.toISOString(),
          time: b.session.time,
          location: b.session.location,
          status: BOOKING_STATUS_MAP[b.status],
          pricePence: Math.round(b.price.toNumber() * 100),
          createdAt: b.createdAt.toISOString(),
        })),
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
      summary: 'Get full booking detail by ID',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { bookingId: { type: 'string' } } },
      response: { 200: bookingSchema },
    },
    preHandler: [...adminGuard, validate({ params: BookingIdParamSchema })],
    handler: async (
      request: FastifyRequest<{ Params: { bookingId: string } }>,
      reply: FastifyReply,
    ) => {
      const booking = await prisma.booking.findUnique({
        where: { id: request.params.bookingId },
        include: { session: { include: { service: true } }, user: true, child: true },
      });
      if (!booking) throw new AppError('BOOKING_NOT_FOUND', 'Booking not found.', 404);

      await reply.status(200).send({
        id: booking.id,
        customerId: booking.userId,
        customerName: `${booking.user.firstName} ${booking.user.lastName}`.trim(),
        childId: booking.childId ?? '',
        childName: booking.child ? `${booking.child.firstName} ${booking.child.lastName}`.trim() : '',
        sessionId: booking.sessionId,
        sessionTitle: booking.session.service.title,
        date: booking.session.date.toISOString(),
        time: booking.session.time,
        location: booking.session.location,
        status: BOOKING_STATUS_MAP[booking.status],
        pricePence: Math.round(booking.price.toNumber() * 100),
        createdAt: booking.createdAt.toISOString(),
      });
    },
  });

  app.patch('/api/v1/admin/bookings/:bookingId', {
    schema: {
      tags: ['Admin'],
      summary: 'Update booking status',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { bookingId: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'CANCELLED'] } },
      },
      response: { 200: bookingSchema },
    },
    preHandler: [
      ...adminGuard,
      validate({ params: BookingIdParamSchema, body: UpdateBookingSchema }),
    ],
    handler: async (
      request: FastifyRequest<{ Params: { bookingId: string }; Body: { status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' } }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.booking.findUnique({ where: { id: request.params.bookingId } });
      if (!existing) throw new AppError('BOOKING_NOT_FOUND', 'Booking not found.', 404);

      const booking = await prisma.booking.update({
        where: { id: request.params.bookingId },
        data: {
          status: request.body.status,
          ...(request.body.status === 'CANCELLED' && { cancelledAt: new Date() }),
        },
        include: { session: { include: { service: true } }, user: true, child: true },
      });

      await reply.status(200).send({
        id: booking.id,
        customerId: booking.userId,
        customerName: `${booking.user.firstName} ${booking.user.lastName}`.trim(),
        childId: booking.childId ?? '',
        childName: booking.child ? `${booking.child.firstName} ${booking.child.lastName}`.trim() : '',
        sessionId: booking.sessionId,
        sessionTitle: booking.session.service.title,
        date: booking.session.date.toISOString(),
        time: booking.session.time,
        location: booking.session.location,
        status: BOOKING_STATUS_MAP[booking.status],
        pricePence: Math.round(booking.price.toNumber() * 100),
        createdAt: booking.createdAt.toISOString(),
      });
    },
  });
}

export default fp(adminBookingsRoutes, { name: 'admin-bookings-routes' });
