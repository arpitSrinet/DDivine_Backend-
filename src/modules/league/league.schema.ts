/**
 * @file league.schema.ts
 * @description Zod schemas for league endpoints. Matches locked frontend contract (Section 8.6).
 *
 * Endpoints:
 *   GET /api/v1/league/table  → response: LeagueTableRowResponse[]
 *   GET /api/v1/league/games  → response: MatchResponse[]
 *
 * @module src/modules/league/league.schema
 */
import { z } from 'zod';

export const LeagueTableRowSchema = z.object({
  id: z.string(),
  teamName: z.string(),
  schoolName: z.string(),
  matchesPlayed: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  GF: z.number().int().nonnegative(),
  GA: z.number().int().nonnegative(),
  GD: z.number().int(),
  points: z.number().int().nonnegative(),
  photoId: z.string().nullable(),
  photoUrl: z.string().nullable(),
});

export const MatchResponseSchema = z.object({
  id: z.string(),
  homeTeamId: z.string(),
  awayTeamId: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  homeScore: z.number().int().nullable(),
  awayScore: z.number().int().nullable(),
  date: z.string(),
  location: z.string(),
  photoId: z.string().nullable(),
  photoUrl: z.string().nullable(),
  status: z.enum(['scheduled', 'completed', 'cancelled']),
});

export type ILeagueTableRow = z.infer<typeof LeagueTableRowSchema>;
export type IMatchResponse = z.infer<typeof MatchResponseSchema>;

export const MATCH_STATUS_MAP = {
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;
