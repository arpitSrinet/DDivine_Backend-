/**
 * @file users.controller.ts
 * @description HTTP handlers for user profile endpoints.
 * @module src/modules/users/users.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { usersService } from './users.service.js';
import type { IUpdateProfile } from './users.schema.js';

export const usersController = {
  async getProfile(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const result = await usersService.getProfile(request.user!.id);
    await reply.status(200).send(result);
  },

  async updateProfile(
    request: FastifyRequest<{ Body: IUpdateProfile }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await usersService.updateProfile(request.user!.id, request.body);
    await reply.status(200).send(result);
  },
};
