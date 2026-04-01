/**
 * @file bookings.controller.ts
 * @description HTTP handlers for booking endpoints.
 * @module src/modules/bookings/bookings.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { bookingsService } from './bookings.service.js';
import type { IBookingIdParam, ICreateBooking } from './bookings.schema.js';

export const bookingsController = {
  async getMyBookings(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const result = await bookingsService.getMyBookings(request.user!.id);
    await reply.status(200).send(result);
  },

  async getBookingById(
    request: FastifyRequest<{ Params: IBookingIdParam }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await bookingsService.getBookingById(
      request.user!.id,
      request.params.bookingId,
    );
    await reply.status(200).send(result);
  },

  async createBooking(
    request: FastifyRequest<{ Body: ICreateBooking }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await bookingsService.createBooking(request.user!.id, request.body);
    await reply.status(201).send(result);
  },

  async cancelBooking(
    request: FastifyRequest<{ Params: IBookingIdParam }>,
    reply: FastifyReply,
  ): Promise<void> {
    await bookingsService.cancelBooking(request.user!.id, request.params.bookingId);
    await reply.status(204).send();
  },
};
