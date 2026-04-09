/**
 * @file league.service.ts
 * @description League business logic — maps DB records to locked API contract shapes.
 * @module src/modules/league/league.service
 */
import { leagueRepository } from './league.repository.js';
import { MATCH_STATUS_MAP } from './league.schema.js';
import type { ILeagueTableRow, IMatchResponse } from './league.schema.js';

export const leagueService = {
  async getTable(): Promise<ILeagueTableRow[]> {
    const standings = await leagueRepository.getLeagueTable();
    return standings.map((s) => ({
      id: s.team.id,
      teamName: s.team.name,
      schoolName: s.team.schoolName ?? '',
      matchesPlayed: s.matchesPlayed,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      GF: s.goalsFor,
      GA: s.goalsAgainst,
      GD: s.goalsFor - s.goalsAgainst,
      points: s.points,
      photoId: s.team.photoId,
      photoUrl: s.team.photo?.url ?? null,
    }));
  },

  async getGames(): Promise<IMatchResponse[]> {
    const matches = await leagueRepository.getMatches();
    return matches.map((m) => ({
      id: m.id,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeTeam: m.homeTeam.name,
      awayTeam: m.awayTeam.name,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      date: m.date.toISOString(),
      location: m.location ?? '',
      photoId: m.photoId,
      photoUrl: m.photo?.url ?? null,
      status: MATCH_STATUS_MAP[m.status],
    }));
  },
};
