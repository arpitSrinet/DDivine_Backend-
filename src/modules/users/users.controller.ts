/**
 * @file users.controller.ts
 * @description HTTP handlers for user profile endpoints.
 * @module src/modules/users/users.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '@/shared/errors/AppError.js';

import { usersService } from './users.service.js';
import type { IChangePassword, IUpdateProfile } from './users.schema.js';

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

  async changePassword(
    request: FastifyRequest<{ Body: IChangePassword }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await usersService.changePassword(request.user!.id, request.body);
    await reply.status(200).send(result);
  },

  async deactivate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const result = await usersService.deactivate(request.user!.id);
    await reply.status(200).send(result);
  },

  async uploadAvatar(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const file = await request.file();
    if (!file) {
      throw new AppError('VALIDATION_ERROR', 'No file was uploaded. Send a multipart/form-data request with field name "avatar".', 422);
    }
    if (file.fieldname !== 'avatar') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Invalid file field. Use multipart/form-data field name "avatar".',
        422,
      );
    }
    const result = await usersService.uploadAvatar(request.user!.id, file);
    await reply.status(200).send(result);
  },
};
