/**
 * @file league.routes.ts
 * @description Fastify route registration for league endpoints. Public — no auth required.
 * @module src/modules/league/league.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { leagueController } from './league.controller.js';

const tableRowSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    teamName: { type: 'string' },
    schoolName: { type: 'string' },
    matchesPlayed: { type: 'integer' },
    wins: { type: 'integer' },
    draws: { type: 'integer' },
    losses: { type: 'integer' },
    GF: { type: 'integer' },
    GA: { type: 'integer' },
    GD: { type: 'integer' },
    points: { type: 'integer' },
    photoId: { type: 'string', nullable: true },
    photoUrl: { type: 'string', nullable: true },
  },
};

const matchSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    homeTeamId: { type: 'string' },
    awayTeamId: { type: 'string' },
    homeTeam: { type: 'string' },
    awayTeam: { type: 'string' },
    homeScore: { type: 'integer', nullable: true },
    awayScore: { type: 'integer', nullable: true },
    date: { type: 'string' },
    location: { type: 'string' },
    photoId: { type: 'string', nullable: true },
    photoUrl: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['scheduled', 'completed', 'cancelled'] },
  },
};

async function leagueRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/league/table', {
    schema: {
      tags: ['League'],
      summary: 'Get league standings table (public — no auth required)',
      response: { 200: { type: 'array', items: tableRowSchema } },
    },
    handler: leagueController.getTable,
  });

  app.get('/api/v1/league/games', {
    schema: {
      tags: ['League'],
      summary: 'Get all league match results (public — no auth required)',
      response: { 200: { type: 'array', items: matchSchema } },
    },
    handler: leagueController.getGames,
  });
}

export default fp(leagueRoutes, { name: 'league-routes' });
