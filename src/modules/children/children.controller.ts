/**
 * @file children.controller.ts
 * @description HTTP handlers for children endpoints.
 * @module src/modules/children/children.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

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
};
