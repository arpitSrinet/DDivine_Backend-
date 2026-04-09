/**
 * @file schools.controller.ts
 * @description Fastify request handlers for schools endpoints.
 * @module src/modules/schools/schools.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { schoolsService } from './schools.service.js';
import type { IUpdateSchool } from './schools.schema.js';

export const schoolsController = {
  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    const profile = await schoolsService.getProfile(request.user!.id);
    await reply.status(200).send(profile);
  },

  async updateProfile(
    request: FastifyRequest<{ Body: IUpdateSchool }>,
    reply: FastifyReply,
  ) {
    const profile = await schoolsService.updateProfile(request.user!.id, request.body);
    await reply.status(200).send(profile);
  },

  async getBookings(request: FastifyRequest, reply: FastifyReply) {
    const bookings = await schoolsService.getBookings(request.user!.id);
    await reply.status(200).send(bookings);
  },
};
