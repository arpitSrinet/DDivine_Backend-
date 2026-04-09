/**
 * @file knowledge.controller.ts
 * @description Fastify request handlers for knowledge/CMS endpoints.
 * @module src/modules/knowledge/knowledge.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { knowledgeService } from './knowledge.service.js';

export const knowledgeController = {
  async getCaseStudies(_request: FastifyRequest, reply: FastifyReply) {
    const data = await knowledgeService.getCaseStudies();
    await reply.status(200).send(data);
  },

  async getFreeActivities(_request: FastifyRequest, reply: FastifyReply) {
    const data = await knowledgeService.getFreeActivities();
    await reply.status(200).send(data);
  },

  async getFaqGroups(_request: FastifyRequest, reply: FastifyReply) {
    const data = await knowledgeService.getFaqGroups();
    await reply.status(200).send(data);
  },
};
