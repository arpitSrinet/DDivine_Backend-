/**
 * @file admin-league-game-requests.routes.ts
 * @description Admin approval workflow for league game requests.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];

const RequestIdParam = z.object({ requestId: z.string().min(1) });

const ListQuerySchema = z.object({
  status: z.enum(['SUBMITTED', 'APPROVED', 'REJECTED']).optional().default('SUBMITTED'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const ApproveBodySchema = z.object({
  homeTeamId: z.string().min(1),
  awayTeamId: z.string().min(1),
  location: z.string().trim().min(1).max(180).optional(),
});

const RejectBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

function combineUtcDateTime(dateOnly: Date, time: string): Date {
  const [hh, mm] = time.split(':').map((v) => Number(v));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return new Date(dateOnly);
  const d = new Date(dateOnly);
  d.setUTCHours(hh, mm, 0, 0);
  return d;
}

function formatLocationFromRequest(r: {
  addressLine1: string;
  addressLine2: string | null;
  town: string;
  postCode: string;
}): string {
  return [r.addressLine1, r.addressLine2, r.town, r.postCode].filter(Boolean).join(', ');
}

async function adminLeagueGameRequestsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/league/game-requests', {
    schema: { tags: ['Admin'], summary: 'List league game requests', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ query: ListQuerySchema })],
    handler: async (
      request: FastifyRequest<{ Querystring: z.infer<typeof ListQuerySchema> }>,
      reply: FastifyReply,
    ) => {
      const { status, page, pageSize } = request.query as unknown as z.infer<typeof ListQuerySchema>;
      const skip = (page - 1) * pageSize;

      const [rows, total] = await Promise.all([
        prisma.leagueGameRequest.findMany({
          where: { status },
          orderBy: { submittedAt: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.leagueGameRequest.count({ where: { status } }),
      ]);

      await reply.status(200).send({
        data: rows.map((r) => ({
          id: r.id,
          status: r.status,
          yearGroup: r.yearGroup,
          playingAt: r.playingAt,
          gameDate: r.gameDate.toISOString().split('T')[0],
          gameTime: r.gameTime,
          addressLine1: r.addressLine1,
          addressLine2: r.addressLine2,
          town: r.town,
          postCode: r.postCode,
          submittedAt: r.submittedAt.toISOString(),
          reviewedAt: r.reviewedAt?.toISOString() ?? null,
          reviewedByAdminId: r.reviewedByAdminId ?? null,
          rejectionReason: r.rejectionReason ?? null,
          approvedMatchId: r.approvedMatchId ?? null,
        })),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });

  app.patch('/api/v1/admin/league/game-requests/:requestId/approve', {
    schema: { tags: ['Admin'], summary: 'Approve league game request and create match', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: RequestIdParam, body: ApproveBodySchema })],
    handler: async (
      request: FastifyRequest<{ Params: z.infer<typeof RequestIdParam>; Body: z.infer<typeof ApproveBodySchema> }>,
      reply: FastifyReply,
    ) => {
      const adminId = request.user!.id;
      const { requestId } = request.params;
      const body = request.body;

      const result = await prisma.$transaction(async (tx) => {
        const r = await tx.leagueGameRequest.findUnique({ where: { id: requestId } });
        if (!r) throw new AppError('ACCOUNT_NOT_FOUND', 'Game request not found.', 404);
        if (r.status !== 'SUBMITTED') {
          throw new AppError('VALIDATION_ERROR', `Only SUBMITTED requests can be approved (current: ${r.status}).`, 400);
        }

        // Validate teams exist up-front (clearer error than FK)
        const [home, away] = await Promise.all([
          tx.team.findUnique({ where: { id: body.homeTeamId } }),
          tx.team.findUnique({ where: { id: body.awayTeamId } }),
        ]);
        if (!home) throw new AppError('ACCOUNT_NOT_FOUND', 'Home team not found.', 404);
        if (!away) throw new AppError('ACCOUNT_NOT_FOUND', 'Away team not found.', 404);

        const location = body.location ?? formatLocationFromRequest(r);
        const matchDate = combineUtcDateTime(r.gameDate, r.gameTime);

        const match = await tx.match.create({
          data: {
            homeTeamId: body.homeTeamId,
            awayTeamId: body.awayTeamId,
            date: matchDate,
            location,
            status: 'SCHEDULED',
            approvedAt: new Date(),
            approvedByAdminId: adminId,
            approvedViaLeagueGameRequestId: r.id,
          },
          include: { homeTeam: true, awayTeam: true },
        });

        const updatedRequest = await tx.leagueGameRequest.update({
          where: { id: r.id },
          data: {
            status: 'APPROVED',
            reviewedAt: new Date(),
            reviewedByAdminId: adminId,
            approvedMatchId: match.id,
            rejectionReason: null,
          },
        });

        return { match, request: updatedRequest };
      });

      await reply.status(200).send({
        data: {
          request: {
            id: result.request.id,
            status: result.request.status,
            approvedMatchId: result.request.approvedMatchId,
            reviewedAt: result.request.reviewedAt?.toISOString() ?? null,
            reviewedByAdminId: result.request.reviewedByAdminId ?? null,
          },
          match: {
            id: result.match.id,
            homeTeamId: result.match.homeTeamId,
            awayTeamId: result.match.awayTeamId,
            date: result.match.date.toISOString(),
            location: result.match.location ?? '',
            status: result.match.status,
            approvedAt: result.match.approvedAt?.toISOString() ?? null,
            approvedByAdminId: result.match.approvedByAdminId ?? null,
            approvedViaLeagueGameRequestId: result.match.approvedViaLeagueGameRequestId ?? null,
          },
        },
      });
    },
  });

  app.patch('/api/v1/admin/league/game-requests/:requestId/reject', {
    schema: { tags: ['Admin'], summary: 'Reject league game request', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: RequestIdParam, body: RejectBodySchema })],
    handler: async (
      request: FastifyRequest<{ Params: z.infer<typeof RequestIdParam>; Body: z.infer<typeof RejectBodySchema> }>,
      reply: FastifyReply,
    ) => {
      const adminId = request.user!.id;
      const { requestId } = request.params;
      const { reason } = request.body;

      const r = await prisma.leagueGameRequest.findUnique({ where: { id: requestId } });
      if (!r) throw new AppError('ACCOUNT_NOT_FOUND', 'Game request not found.', 404);
      if (r.status !== 'SUBMITTED') {
        throw new AppError('VALIDATION_ERROR', `Only SUBMITTED requests can be rejected (current: ${r.status}).`, 400);
      }

      const updated = await prisma.leagueGameRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
          reviewedByAdminId: adminId,
          rejectionReason: reason,
          approvedMatchId: null,
        },
      });

      await reply.status(200).send({
        data: {
          id: updated.id,
          status: updated.status,
          reviewedAt: updated.reviewedAt?.toISOString() ?? null,
          reviewedByAdminId: updated.reviewedByAdminId ?? null,
          rejectionReason: updated.rejectionReason ?? null,
        },
      });
    },
  });
}

export default fp(adminLeagueGameRequestsRoutes, { name: 'admin-league-game-requests-routes' });

