/**
 * @file children.controller.ts
 * @description HTTP handlers for children endpoints.
 * @module src/modules/children/children.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '@/shared/errors/AppError.js';
import { childrenService } from './children.service.js';
import type { IChildIdParam, ICreateChild, IUpdateChild } from './children.schema.js';

export const childrenController = {
  async getChildren(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const result = await childrenService.getChildren(request.user!.id);
    await reply.status(200).send(result);
  },

  async createChild(
    request: FastifyRequest<{ Body: ICreateChild }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await childrenService.createChild(request.user!.id, request.body);
    await reply.status(201).send(result);
  },

  async updateChild(
    request: FastifyRequest<{ Params: IChildIdParam; Body: IUpdateChild }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await childrenService.updateChild(
      request.user!.id,
      request.params.childId,
      request.body,
    );
    await reply.status(200).send(result);
  },

  async deleteChild(
    request: FastifyRequest<{ Params: IChildIdParam }>,
    reply: FastifyReply,
  ): Promise<void> {
    await childrenService.deleteChild(request.user!.id, request.params.childId);
    await reply.status(204).send();
  },

  async uploadAvatar(
    request: FastifyRequest<{ Params: IChildIdParam }>,
    reply: FastifyReply,
  ): Promise<void> {
    const file = await request.file();
    if (!file) {
      throw new AppError(
        'VALIDATION_ERROR',
        'No file was uploaded. Send a multipart/form-data request with field name "avatar".',
        422,
      );
    }
    if (file.fieldname !== 'avatar') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Invalid file field. Use multipart/form-data field name "avatar".',
        422,
      );
    }

    const result = await childrenService.uploadAvatar(
      request.user!.id,
      request.params.childId,
      file,
    );
    await reply.status(200).send(result);
  },

  async removeAvatar(
    request: FastifyRequest<{ Params: IChildIdParam }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await childrenService.removeAvatar(
      request.user!.id,
      request.params.childId,
    );
    await reply.status(200).send(result);
  },
};
