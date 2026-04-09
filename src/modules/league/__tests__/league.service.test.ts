/**
 * @file league.service.test.ts
 * @description Unit tests for league service response mapping.
 * @module src/modules/league/__tests__/league.service
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { leagueService } from '../league.service.js';
import { leagueRepository } from '../league.repository.js';

vi.mock('../league.repository.js', () => ({
  leagueRepository: {
    getLeagueTable: vi.fn(),
    getMatches: vi.fn(),
  },
}));

const mockLeagueRepository = vi.mocked(leagueRepository);

describe('leagueService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps league standings to API table rows', async () => {
    mockLeagueRepository.getLeagueTable.mockResolvedValue([
      {
        team: {
          id: 'team-1',
          name: 'DDivine Eagles',
          schoolName: "St. Mary's",
          photoId: null,
          photo: null,
        },
        matchesPlayed: 10,
        wins: 7,
        draws: 2,
        losses: 1,
        goalsFor: 22,
        goalsAgainst: 8,
        points: 23,
      },
    ] as never);

    const result = await leagueService.getTable();

    expect(result).toEqual([
      {
        id: 'team-1',
        teamName: 'DDivine Eagles',
        schoolName: "St. Mary's",
        matchesPlayed: 10,
        wins: 7,
        draws: 2,
        losses: 1,
        GF: 22,
        GA: 8,
        GD: 14,
        points: 23,
        photoId: null,
        photoUrl: null,
      },
    ]);
  });

  it('maps matches and converts date/status fields correctly', async () => {
    mockLeagueRepository.getMatches.mockResolvedValue([
      {
        id: 'match-1',
        homeTeamId: 'h1',
        awayTeamId: 'a1',
        homeTeam: { name: 'Eagles' },
        awayTeam: { name: 'Falcons' },
        homeScore: 2,
        awayScore: 1,
        date: new Date('2026-04-03T10:00:00.000Z'),
        location: 'Hackney',
        photoId: null,
        photo: null,
        status: 'COMPLETED',
      },
    ] as never);

    const result = await leagueService.getGames();

    expect(result).toEqual([
      {
        id: 'match-1',
        homeTeamId: 'h1',
        awayTeamId: 'a1',
        homeTeam: 'Eagles',
        awayTeam: 'Falcons',
        homeScore: 2,
        awayScore: 1,
        date: '2026-04-03T10:00:00.000Z',
        location: 'Hackney',
        photoId: null,
        photoUrl: null,
        status: 'completed',
      },
    ]);
  });
});
