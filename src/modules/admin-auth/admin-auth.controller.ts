/**
 * @file admin-auth.controller.ts
 * @description HTTP handlers for admin auth endpoints.
 * @module src/modules/admin-auth/admin-auth.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { adminAuthService } from './admin-auth.service.js';
import type { IAdminLogin } from './admin-auth.schema.js';

export const adminAuthController = {
  async login(
    request: FastifyRequest<{ Body: IAdminLogin }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await adminAuthService.login(request.body);
    await reply.status(200).send(result);
  },

  async logout(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const token = request.headers.authorization!.slice(7);
    const result = await adminAuthService.logout(token);
    await reply.status(200).send(result);
  },
};
