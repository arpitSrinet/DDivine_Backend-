/**
 * @file services.controller.ts
 * @description HTTP handler for the public services catalog endpoint.
 * @module src/modules/services/services.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { servicesService } from './services.service.js';

export const servicesController = {
  async getServices(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const result = await servicesService.getServices();
    await reply.status(200).send(result);
  },
};
