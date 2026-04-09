/**
 * @file league.controller.ts
 * @description Fastify request handlers for league endpoints.
 * @module src/modules/league/league.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { leagueService } from './league.service.js';

export const leagueController = {
  async getTable(_request: FastifyRequest, reply: FastifyReply) {
    const table = await leagueService.getTable();
    await reply.status(200).send(table);
  },

  async getGames(_request: FastifyRequest, reply: FastifyReply) {
    const games = await leagueService.getGames();
    await reply.status(200).send(games);
  },
};
