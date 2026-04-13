/**
 * @file bookings.routes.ts
 * @description Fastify route registration for bookings. All routes require auth.
 * @module src/modules/bookings/bookings.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

import { bookingsController } from './bookings.controller.js';
import { BookingIdParamSchema, CreateBookingSchema } from './bookings.schema.js';

const bookingResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    bookingType: { type: 'string', enum: ['session', 'event'] },
    bookingReference: { type: 'string' },
    serviceName: { type: 'string' },
    date: { type: 'string' },
    time: { type: 'string' },
    location: { type: 'string' },
    status: {
      type: 'string',
      enum: [
        'pending_payment',
        'government_payment_pending',
        'confirmed',
        'refunded',
        'cancelled',
      ],
    },
    coachName: { type: 'string' },
    price: { type: 'number' },
    attendee: {
      type: 'object',
      properties: {
        childId: { type: 'string' },
        childName: { type: 'string' },
      },
    },
    contact: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
      },
    },
    payment: {
      type: 'object',
      properties: {
        method: { type: 'string' },
        currency: { type: 'string' },
        subtotal: { type: 'number' },
        addonsTotal: { type: 'number' },
        discountTotal: { type: 'number' },
        serviceFee: { type: 'number' },
        totalPaid: { type: 'number' },
      },
    },
    receipt: {
      type: 'object',
      properties: {
        downloadUrl: { type: 'string' },
      },
    },
  },
};

async function bookingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/bookings/mine', {
    schema: {
      tags: ['Bookings'],
      summary: 'Get all bookings for the current user',
      security: [{ BearerAuth: [] }],
      response: { 200: { type: 'array', items: bookingResponseSchema } },
    },
    preHandler: [authMiddleware],
    handler: bookingsController.getMyBookings,
  });

  app.get('/api/v1/bookings/:bookingId', {
    schema: {
      tags: ['Bookings'],
      summary: 'Get a booking by ID',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { bookingId: { type: 'string' } } },
      response: { 200: bookingResponseSchema },
    },
    preHandler: [authMiddleware, validate({ params: BookingIdParamSchema })],
    handler: bookingsController.getBookingById,
  });

  app.post('/api/v1/bookings', {
    schema: {
      tags: ['Bookings'],
      summary: 'Create a booking. Pass Idempotency-Key header to prevent duplicates.',
      security: [{ BearerAuth: [] }],
      body: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
          childId: { type: 'string', description: 'Required for parent bookings' },
          idempotencyKey: { type: 'string' },
        },
      },
      response: { 201: bookingResponseSchema },
    },
    preHandler: [authMiddleware, validate({ body: CreateBookingSchema })],
    handler: bookingsController.createBooking,
  });

  app.delete('/api/v1/bookings/:bookingId', {
    schema: {
      tags: ['Bookings'],
      summary: 'Cancel a booking',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { bookingId: { type: 'string' } } },
      response: { 204: { type: 'null' } },
    },
    preHandler: [authMiddleware, validate({ params: BookingIdParamSchema })],
    handler: bookingsController.cancelBooking,
  });
}

export default fp(bookingsRoutes, { name: 'bookings-routes' });
