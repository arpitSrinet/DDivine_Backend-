/**
 * @file league.repository.ts
 * @description Data access layer for league. All Prisma queries live here.
 * @module src/modules/league/league.repository
 */
import { prisma } from '@/shared/infrastructure/prisma.js';

export const leagueRepository = {
  async getLeagueTable() {
    return prisma.leagueStanding.findMany({
      include: { team: { include: { photo: { select: { id: true, url: true } } } } },
      orderBy: [{ points: 'desc' }, { wins: 'desc' }],
    });
  },

  async getMatches() {
    return prisma.match.findMany({
      include: {
        homeTeam: true,
        awayTeam: true,
        photo: { select: { id: true, url: true } },
      },
      orderBy: { date: 'desc' },
    });
  },
};
