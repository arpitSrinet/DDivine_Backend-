/**
 * @file sessions.controller.ts
 * @description HTTP handlers for session endpoints.
 * @module src/modules/sessions/sessions.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { sessionsService } from './sessions.service.js';
import type { ISessionFilter, ISessionIdParam } from './sessions.schema.js';

export const sessionsController = {
  async getSessions(
    request: FastifyRequest<{ Querystring: ISessionFilter }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await sessionsService.getSessions(request.query);
    await reply.status(200).send(result);
  },

  async getSessionById(
    request: FastifyRequest<{ Params: ISessionIdParam }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await sessionsService.getSessionById(request.params.sessionId);
    await reply.status(200).send(result);
  },
};
