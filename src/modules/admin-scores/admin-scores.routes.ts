/**
 * @file admin-scores.routes.ts
 * @description Admin league table, matches, and child performance records.
 * @module src/modules/admin-scores/admin-scores.routes
 */
import type { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];

const TeamIdParam = z.object({ teamId: z.string().min(1) });
const MatchIdParam = z.object({ matchId: z.string().min(1) });
const PerfIdParam = z.object({ id: z.string().min(1) });

const PutLeagueSchema = z.object({
  teams: z.array(
    z.object({
      id: z.string().min(1),
      W: z.number().int().nonnegative(),
      D: z.number().int().nonnegative(),
      L: z.number().int().nonnegative(),
      GF: z.number().int().nonnegative(),
      GA: z.number().int().nonnegative(),
    }),
  ),
});

const PostTeamSchema = z.object({
  name: z.string().min(1),
  schoolName: z.string().min(1),
  photoId: z.string().optional(),
});

const PostMatchSchema = z.object({
  homeTeamId: z.string().min(1),
  awayTeamId: z.string().min(1),
  homeScore: z.number().int().nonnegative(),
  awayScore: z.number().int().nonnegative(),
  date: z.string().min(1),
  location: z.string().min(1),
  photoId: z.string().optional(),
});

const PatchMatchSchema = PostMatchSchema.partial().extend({
  photoId: z.union([z.string().min(1), z.null()]).optional(),
});

const PostPerformanceSchema = z.object({
  childId: z.string().min(1),
  sessionId: z.string().min(1),
  date: z.string().min(1),
  goalsScored: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  attendanceRate: z.number().min(0).max(100),
  rating: z.number().int().min(1).max(5).optional(),
  coachNotes: z.string().optional(),
});

const PatchPerformanceSchema = PostPerformanceSchema.partial().extend({
  childId: z.string().optional(),
  sessionId: z.string().optional(),
});

function sessionLabel(s: { date: Date; service: { title: string } }): string {
  const d = s.date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${s.service.title} — ${d}`;
}

async function adminScoresRoutes(app: FastifyInstance): Promise<void> {
  // ─── League table ──────────────────────────────────────────────────────

  app.get('/api/v1/admin/scores/league', {
    schema: { tags: ['Admin'], summary: 'League table with GF/GA/GD for admin', security: [{ BearerAuth: [] }] },
    preHandler: adminGuard,
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const teams = await prisma.team.findMany({
        where: { isActive: true },
        include: { standing: true, photo: { select: { id: true, url: true } } },
      });
      const rows = teams
        .filter((t) => t.standing)
        .sort((a, b) => {
          const pa = a.standing!.points;
          const pb = b.standing!.points;
          if (pb !== pa) return pb - pa;
          const gda = a.standing!.goalsFor - a.standing!.goalsAgainst;
          const gdb = b.standing!.goalsFor - b.standing!.goalsAgainst;
          if (gdb !== gda) return gdb - gda;
          return a.name.localeCompare(b.name);
        })
        .map((t) => {
          const st = t.standing!;
          const gd = st.goalsFor - st.goalsAgainst;
          return {
            id: t.id,
            name: t.name,
            schoolName: t.schoolName ?? '',
            P: st.matchesPlayed,
            W: st.wins,
            D: st.draws,
            L: st.losses,
            GF: st.goalsFor,
            GA: st.goalsAgainst,
            GD: gd,
            Pts: st.points,
            photoId: t.photoId ?? undefined,
            photoUrl: t.photo?.url,
          };
        });
      await reply.status(200).send({ teams: rows });
    },
  });

  app.put('/api/v1/admin/scores/league', {
    schema: { tags: ['Admin'], summary: 'Replace league stats rows (recalculates P / Pts)', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ body: PutLeagueSchema })],
    handler: async (request: FastifyRequest<{ Body: z.infer<typeof PutLeagueSchema> }>, reply: FastifyReply) => {
      const ids = request.body.teams.map((r) => r.id);
      const existing = await prisma.leagueStanding.findMany({
        where: { teamId: { in: ids } },
        select: { teamId: true },
      });
      const foundIds = new Set(existing.map((r) => r.teamId));
      const missing = ids.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new AppError('VALIDATION_ERROR', `Unknown team IDs: ${missing.join(', ')}`, 422);
      }
      await prisma.$transaction(
        request.body.teams.map((row) => {
          const matchesPlayed = row.W + row.D + row.L;
          const points = 3 * row.W + row.D;
          return prisma.leagueStanding.updateMany({
            where: { teamId: row.id },
            data: {
              wins: row.W,
              draws: row.D,
              losses: row.L,
              goalsFor: row.GF,
              goalsAgainst: row.GA,
              matchesPlayed,
              points,
            },
          });
        }),
      );
      await reply.status(200).send({ ok: true });
    },
  });

  app.get('/api/v1/admin/scores/league/teams', {
    schema: { tags: ['Admin'], summary: 'List league teams with standings', security: [{ BearerAuth: [] }] },
    preHandler: adminGuard,
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const teams = await prisma.team.findMany({
        where: { isActive: true },
        include: { standing: true, photo: { select: { id: true, url: true } } },
      });
      const rows = teams
        .filter((t) => t.standing)
        .sort((a, b) => {
          const pa = a.standing!.points;
          const pb = b.standing!.points;
          if (pb !== pa) return pb - pa;
          const gda = a.standing!.goalsFor - a.standing!.goalsAgainst;
          const gdb = b.standing!.goalsFor - b.standing!.goalsAgainst;
          if (gdb !== gda) return gdb - gda;
          return a.name.localeCompare(b.name);
        })
        .map((t) => {
          const st = t.standing!;
          return {
            id: t.id,
            name: t.name,
            schoolName: t.schoolName ?? '',
            played: st.matchesPlayed,
            won: st.wins,
            drawn: st.draws,
            lost: st.losses,
            goalsFor: st.goalsFor,
            goalsAgainst: st.goalsAgainst,
            goalDifference: st.goalsFor - st.goalsAgainst,
            points: st.points,
            photoId: t.photoId ?? undefined,
            photoUrl: t.photo?.url,
          };
        });
      await reply.status(200).send(rows);
    },
  });

  app.post('/api/v1/admin/scores/league/teams', {
    schema: { tags: ['Admin'], summary: 'Create league team + standing', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ body: PostTeamSchema })],
    handler: async (request: FastifyRequest<{ Body: z.infer<typeof PostTeamSchema> }>, reply: FastifyReply) => {
      const { name, schoolName, photoId } = request.body;
      if (photoId) {
        const m = await prisma.mediaAsset.findUnique({ where: { id: photoId } });
        if (!m) throw new AppError('ACCOUNT_NOT_FOUND', 'Photo media not found.', 404);
      }
      const team = await prisma.team.create({
        data: {
          name,
          schoolName,
          photoId,
          standing: { create: {} },
        },
        include: { standing: true, photo: true },
      });
      await reply.status(201).send({
        id: team.id,
        name: team.name,
        schoolName: team.schoolName ?? '',
        photoId: team.photoId ?? undefined,
        photoUrl: team.photo?.url,
      });
    },
  });

  app.delete('/api/v1/admin/scores/league/teams/:teamId', {
    schema: { tags: ['Admin'], summary: 'Delete team (blocked if has completed results)', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: TeamIdParam })],
    handler: async (request: FastifyRequest<{ Params: { teamId: string } }>, reply: FastifyReply) => {
      const teamId = request.params.teamId;
      const blocked = await prisma.match.count({
        where: {
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
          status: 'COMPLETED',
          homeScore: { not: null },
          awayScore: { not: null },
        },
      });
      if (blocked > 0) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Cannot delete a team that has completed match results.',
          409,
        );
      }
      const t = await prisma.team.findUnique({ where: { id: teamId } });
      if (!t) throw new AppError('ACCOUNT_NOT_FOUND', 'Team not found.', 404);
      await prisma.team.delete({ where: { id: teamId } });
      await reply.status(204).send();
    },
  });

  // ─── Matches ───────────────────────────────────────────────────────────

  app.get('/api/v1/admin/scores/matches', {
    schema: {
      tags: ['Admin'],
      summary: 'List matches (admin)',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          teamId: { type: 'string' },
          dateFrom: { type: 'string' },
          dateTo: { type: 'string' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
    },
    preHandler: adminGuard,
    handler: async (
      request: FastifyRequest<{
        Querystring: { teamId?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const { teamId, dateFrom, dateTo, page = 1 } = request.query;
      const pageSize = Math.min(request.query.pageSize ?? 20, 100);
      const skip = (page - 1) * pageSize;
      const where: Prisma.MatchWhereInput = {
        ...(teamId && { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] }),
        ...(dateFrom || dateTo
          ? {
              date: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lte: new Date(dateTo) } : {}),
              },
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.match.findMany({
          where,
          include: {
            homeTeam: true,
            awayTeam: true,
            photo: { select: { id: true, url: true } },
          },
          skip,
          take: pageSize,
          orderBy: { date: 'desc' },
        }),
        prisma.match.count({ where }),
      ]);
      await reply.status(200).send({
        data: rows.map((m) => ({
          id: m.id,
          homeTeamId: m.homeTeamId,
          homeTeamName: m.homeTeam.name,
          awayTeamId: m.awayTeamId,
          awayTeamName: m.awayTeam.name,
          homeScore: m.homeScore ?? 0,
          awayScore: m.awayScore ?? 0,
          date: m.date.toISOString().split('T')[0],
          location: m.location ?? '',
          photoId: m.photoId ?? undefined,
          photoUrl: m.photo?.url,
          createdAt: m.createdAt.toISOString(),
        })),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });

  app.post('/api/v1/admin/scores/matches', {
    schema: { tags: ['Admin'], summary: 'Create match result', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ body: PostMatchSchema })],
    handler: async (request: FastifyRequest<{ Body: z.infer<typeof PostMatchSchema> }>, reply: FastifyReply) => {
      const b = request.body;
      if (b.photoId) {
        const m = await prisma.mediaAsset.findUnique({ where: { id: b.photoId } });
        if (!m) throw new AppError('ACCOUNT_NOT_FOUND', 'Photo media not found.', 404);
      }
      const row = await prisma.match.create({
        data: {
          homeTeamId: b.homeTeamId,
          awayTeamId: b.awayTeamId,
          homeScore: b.homeScore,
          awayScore: b.awayScore,
          date: new Date(b.date),
          location: b.location,
          photoId: b.photoId,
          status: 'COMPLETED',
        },
        include: { homeTeam: true, awayTeam: true, photo: true },
      });
      await reply.status(201).send({
        id: row.id,
        homeTeamId: row.homeTeamId,
        homeTeamName: row.homeTeam.name,
        awayTeamId: row.awayTeamId,
        awayTeamName: row.awayTeam.name,
        homeScore: row.homeScore ?? 0,
        awayScore: row.awayScore ?? 0,
        date: row.date.toISOString().split('T')[0],
        location: row.location ?? '',
        photoId: row.photoId ?? undefined,
        photoUrl: row.photo?.url,
        createdAt: row.createdAt.toISOString(),
      });
    },
  });

  app.patch('/api/v1/admin/scores/matches/:matchId', {
    schema: { tags: ['Admin'], summary: 'Update match', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: MatchIdParam, body: PatchMatchSchema })],
    handler: async (
      request: FastifyRequest<{ Params: { matchId: string }; Body: z.infer<typeof PatchMatchSchema> }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.match.findUnique({ where: { id: request.params.matchId } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Match not found.', 404);
      const b = request.body;
      if (b.photoId) {
        const m = await prisma.mediaAsset.findUnique({ where: { id: b.photoId } });
        if (!m) throw new AppError('ACCOUNT_NOT_FOUND', 'Photo media not found.', 404);
      }
      const data: Prisma.MatchUpdateInput = {};
      if (b.homeTeamId !== undefined) data.homeTeam = { connect: { id: b.homeTeamId } };
      if (b.awayTeamId !== undefined) data.awayTeam = { connect: { id: b.awayTeamId } };

      if (b.homeScore !== undefined) data.homeScore = b.homeScore;
      if (b.awayScore !== undefined) data.awayScore = b.awayScore;
      if (b.date !== undefined) data.date = new Date(b.date);
      if (b.location !== undefined) data.location = b.location;
      if (b.photoId !== undefined) {
        data.photo = b.photoId ? { connect: { id: b.photoId } } : { disconnect: true };
      }
      const row = await prisma.match.update({
        where: { id: request.params.matchId },
        data,
        include: { homeTeam: true, awayTeam: true, photo: true },
      });
      await reply.status(200).send({
        id: row.id,
        homeTeamId: row.homeTeamId,
        homeTeamName: row.homeTeam.name,
        awayTeamId: row.awayTeamId,
        awayTeamName: row.awayTeam.name,
        homeScore: row.homeScore ?? 0,
        awayScore: row.awayScore ?? 0,
        date: row.date.toISOString().split('T')[0],
        location: row.location ?? '',
        photoId: row.photoId ?? undefined,
        photoUrl: row.photo?.url,
        createdAt: row.createdAt.toISOString(),
      });
    },
  });

  app.delete('/api/v1/admin/scores/matches/:matchId', {
    schema: { tags: ['Admin'], summary: 'Delete match', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: MatchIdParam })],
    handler: async (request: FastifyRequest<{ Params: { matchId: string } }>, reply: FastifyReply) => {
      const existing = await prisma.match.findUnique({ where: { id: request.params.matchId } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Match not found.', 404);
      await prisma.match.delete({ where: { id: request.params.matchId } });
      await reply.status(204).send();
    },
  });

  // ─── Child performance ─────────────────────────────────────────────────

  app.get('/api/v1/admin/scores/performance', {
    schema: {
      tags: ['Admin'],
      summary: 'List child performance records',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          childId: { type: 'string' },
          sessionId: { type: 'string' },
          dateFrom: { type: 'string' },
          dateTo: { type: 'string' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
    },
    preHandler: adminGuard,
    handler: async (
      request: FastifyRequest<{
        Querystring: {
          childId?: string;
          sessionId?: string;
          dateFrom?: string;
          dateTo?: string;
          page?: number;
          pageSize?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { childId, sessionId, dateFrom, dateTo, page = 1 } = request.query;
      const pageSize = Math.min(request.query.pageSize ?? 20, 100);
      const skip = (page - 1) * pageSize;
      const where: Prisma.ChildPerformanceWhereInput = {
        ...(childId && { childId }),
        ...(sessionId && { sessionId }),
        ...(dateFrom || dateTo
          ? {
              date: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lte: new Date(dateTo) } : {}),
              },
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.childPerformance.findMany({
          where,
          include: {
            child: { select: { firstName: true, lastName: true } },
            session: { include: { service: { select: { title: true } } } },
          },
          skip,
          take: pageSize,
          orderBy: { date: 'desc' },
        }),
        prisma.childPerformance.count({ where }),
      ]);
      await reply.status(200).send({
        data: rows.map((r) => ({
          id: r.id,
          childId: r.childId,
          childName: `${r.child.firstName} ${r.child.lastName}`.trim(),
          sessionId: r.sessionId,
          sessionLabel: sessionLabel(r.session),
          date: r.date.toISOString().split('T')[0],
          goalsScored: r.goalsScored,
          assists: r.assists,
          attendanceRate: r.attendanceRate.toNumber(),
          rating: r.rating ?? undefined,
          coachNotes: r.coachNotes ?? undefined,
          createdAt: r.createdAt.toISOString(),
        })),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });

  app.post('/api/v1/admin/scores/performance', {
    schema: { tags: ['Admin'], summary: 'Create performance record', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ body: PostPerformanceSchema })],
    handler: async (request: FastifyRequest<{ Body: z.infer<typeof PostPerformanceSchema> }>, reply: FastifyReply) => {
      const b = request.body;
      const child = await prisma.child.findUnique({ where: { id: b.childId } });
      if (!child) throw new AppError('ACCOUNT_NOT_FOUND', 'Child not found.', 404);
      const session = await prisma.session.findUnique({
        where: { id: b.sessionId },
        include: { service: true },
      });
      if (!session) throw new AppError('ACCOUNT_NOT_FOUND', 'Session not found.', 404);
      const row = await prisma.childPerformance.create({
        data: {
          childId: b.childId,
          sessionId: b.sessionId,
          date: new Date(b.date),
          goalsScored: b.goalsScored,
          assists: b.assists,
          attendanceRate: b.attendanceRate,
          rating: b.rating,
          coachNotes: b.coachNotes,
        },
        include: {
          child: { select: { firstName: true, lastName: true } },
          session: { include: { service: { select: { title: true } } } },
        },
      });
      await reply.status(201).send({
        id: row.id,
        childId: row.childId,
        childName: `${row.child.firstName} ${row.child.lastName}`.trim(),
        sessionId: row.sessionId,
        sessionLabel: sessionLabel(row.session),
        date: row.date.toISOString().split('T')[0],
        goalsScored: row.goalsScored,
        assists: row.assists,
        attendanceRate: row.attendanceRate.toNumber(),
        rating: row.rating ?? undefined,
        coachNotes: row.coachNotes ?? undefined,
        createdAt: row.createdAt.toISOString(),
      });
    },
  });

  app.patch('/api/v1/admin/scores/performance/:id', {
    schema: { tags: ['Admin'], summary: 'Update performance record', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: PerfIdParam, body: PatchPerformanceSchema })],
    handler: async (
      request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof PatchPerformanceSchema> }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.childPerformance.findUnique({ where: { id: request.params.id } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Performance record not found.', 404);
      const b = request.body;
      const data: Prisma.ChildPerformanceUpdateInput = {};
      if (b.childId !== undefined) data.child = { connect: { id: b.childId } };
      if (b.sessionId !== undefined) data.session = { connect: { id: b.sessionId } };
      if (b.date !== undefined) data.date = new Date(b.date);
      if (b.goalsScored !== undefined) data.goalsScored = b.goalsScored;
      if (b.assists !== undefined) data.assists = b.assists;
      if (b.attendanceRate !== undefined) data.attendanceRate = b.attendanceRate;
      if (b.rating !== undefined) data.rating = b.rating;
      if (b.coachNotes !== undefined) data.coachNotes = b.coachNotes;
      const row = await prisma.childPerformance.update({
        where: { id: request.params.id },
        data,
        include: {
          child: { select: { firstName: true, lastName: true } },
          session: { include: { service: { select: { title: true } } } },
        },
      });
      await reply.status(200).send({
        id: row.id,
        childId: row.childId,
        childName: `${row.child.firstName} ${row.child.lastName}`.trim(),
        sessionId: row.sessionId,
        sessionLabel: sessionLabel(row.session),
        date: row.date.toISOString().split('T')[0],
        goalsScored: row.goalsScored,
        assists: row.assists,
        attendanceRate: row.attendanceRate.toNumber(),
        rating: row.rating ?? undefined,
        coachNotes: row.coachNotes ?? undefined,
        createdAt: row.createdAt.toISOString(),
      });
    },
  });

  app.delete('/api/v1/admin/scores/performance/:id', {
    schema: { tags: ['Admin'], summary: 'Delete performance record', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: PerfIdParam })],
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const existing = await prisma.childPerformance.findUnique({ where: { id: request.params.id } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Performance record not found.', 404);
      await prisma.childPerformance.delete({ where: { id: request.params.id } });
      await reply.status(204).send();
    },
  });
}

export default fp(adminScoresRoutes, { name: 'admin-scores-routes' });
