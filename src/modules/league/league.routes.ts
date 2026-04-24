/**
 * @file league.routes.ts
 * @description Fastify route registration for league endpoints. Public — no auth required.
 * @module src/modules/league/league.routes
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import { prisma } from '@/shared/infrastructure/prisma.js';
import { rateLimiter } from '@/shared/middleware/rateLimiter.js';
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

const UK_POSTCODE_REGEX =
  /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i;

const LeagueGameRequestSchema = z.object({
  yearGroup: z.enum(['year-5', 'year-6']),
  playingAt: z.enum(['home', 'away']),
  gameDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must use YYYY-MM-DD format')
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(`${value}T`);
    }, 'Invalid date'),
  gameTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Must use HH:mm 24h format'),
  addressLine1: z.string().trim().min(1, 'Required').max(120, 'Must be at most 120 characters'),
  addressLine2: z
    .string()
    .trim()
    .max(120, 'Must be at most 120 characters')
    .optional()
    .nullable(),
  town: z.string().trim().min(1, 'Required').max(80, 'Must be at most 80 characters'),
  postCode: z
    .string()
    .trim()
    .min(1, 'Required')
    .regex(UK_POSTCODE_REGEX, 'Invalid UK postcode format')
    .transform((value) => value.toUpperCase()),
});

function toFieldMap(issues: z.ZodIssue[]): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = issue.path[0] ? String(issue.path[0]) : 'general';
    if (!errors[field]) errors[field] = [];
    errors[field].push(issue.message);
  }
  return errors;
}

function formatAsUtcDateOnly(value: Date): string {
  return value.toISOString().split('T')[0];
}

interface ICreatedLeagueGameRequestRow {
  id: string;
  yearGroup: string;
  playingAt: string;
  gameDate: Date;
  gameTime: string;
  addressLine1: string;
  addressLine2: string | null;
  town: string;
  postCode: string;
  submittedAt: Date;
}

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

  app.post('/api/v1/league/game-requests', {
    schema: {
      tags: ['League'],
      summary: 'Submit school league game request (public — no auth required)',
      body: {
        type: 'object',
        required: ['yearGroup', 'playingAt', 'gameDate', 'gameTime', 'addressLine1', 'town', 'postCode'],
        properties: {
          yearGroup: { type: 'string', enum: ['year-5', 'year-6'] },
          playingAt: { type: 'string', enum: ['home', 'away'] },
          gameDate: { type: 'string', format: 'date' },
          gameTime: { type: 'string' },
          addressLine1: { type: 'string' },
          addressLine2: { type: 'string', nullable: true },
          town: { type: 'string' },
          postCode: { type: 'string' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                requestId: { type: 'string' },
                status: { type: 'string', enum: ['submitted'] },
                submittedAt: { type: 'string' },
                yearGroup: { type: 'string', enum: ['year-5', 'year-6'] },
                playingAt: { type: 'string', enum: ['home', 'away'] },
                gameDate: { type: 'string' },
                gameTime: { type: 'string' },
                addressLine1: { type: 'string' },
                addressLine2: { type: 'string', nullable: true },
                town: { type: 'string' },
                postCode: { type: 'string' },
              },
            },
          },
        },
      },
    },
    preHandler: [rateLimiter({ max: 5, windowSeconds: 10 * 60, keyPrefix: 'league-game-request' })],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = LeagueGameRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        await reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: toFieldMap(parsed.error.issues),
        });
        return;
      }

      const input = parsed.data;
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const gameDate = new Date(`${input.gameDate}T00:00:00.000Z`);
      if (gameDate < today) {
        await reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: {
            gameDate: ['Game date cannot be in the past'],
          },
        });
        return;
      }

      const userAgentHeader = request.headers['user-agent'];
      const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader.join(', ') : (userAgentHeader ?? null);
      const id = randomUUID();
      const rows = await prisma.$queryRaw<ICreatedLeagueGameRequestRow[]>`
        INSERT INTO "LeagueGameRequest" (
          "id",
          "status",
          "yearGroup",
          "playingAt",
          "gameDate",
          "gameTime",
          "addressLine1",
          "addressLine2",
          "town",
          "postCode",
          "ip",
          "userAgent",
          "updatedAt"
        )
        VALUES (
          ${id},
          'SUBMITTED',
          ${input.yearGroup},
          ${input.playingAt},
          ${gameDate},
          ${input.gameTime},
          ${input.addressLine1},
          ${input.addressLine2 || null},
          ${input.town},
          ${input.postCode},
          ${request.ip},
          ${userAgent},
          CURRENT_TIMESTAMP
        )
        RETURNING
          "id",
          "yearGroup",
          "playingAt",
          "gameDate",
          "gameTime",
          "addressLine1",
          "addressLine2",
          "town",
          "postCode",
          "submittedAt"
      `;

      const created = rows[0];
      if (!created) {
        await reply.status(500).send({
          code: 'SERVER_ERROR',
          message: 'Failed to create game request',
        });
        return;
      }

      await reply.status(201).send({
        data: {
          requestId: created.id,
          status: 'submitted',
          submittedAt: created.submittedAt.toISOString(),
          yearGroup: created.yearGroup,
          playingAt: created.playingAt,
          gameDate: formatAsUtcDateOnly(created.gameDate),
          gameTime: created.gameTime,
          addressLine1: created.addressLine1,
          addressLine2: created.addressLine2,
          town: created.town,
          postCode: created.postCode,
        },
      });
    },
  });

  app.get('/api/v1/league/game-requests/:requestId', {
    schema: {
      tags: ['League'],
      summary: 'Get league game request status (public — no auth required)',
      params: {
        type: 'object',
        required: ['requestId'],
        properties: {
          requestId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                requestId: { type: 'string' },
                status: { type: 'string', enum: ['submitted', 'approved', 'rejected'] },
              },
              required: ['requestId', 'status'],
            },
          },
          required: ['data'],
        },
      },
    },
    handler: async (
      request: FastifyRequest<{ Params: { requestId: string } }>,
      reply: FastifyReply,
    ) => {
      const requestId = request.params?.requestId;
      if (!requestId) {
        await reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: { requestId: ['Required'] },
        });
        return;
      }

      const row = await prisma.leagueGameRequest.findUnique({
        where: { id: requestId },
        select: { id: true, status: true },
      });

      if (!row) {
        await reply.status(404).send({
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Game request not found.',
        });
        return;
      }

      const status = row.status === 'SUBMITTED' ? 'submitted' : row.status === 'APPROVED' ? 'approved' : 'rejected';
      await reply.status(200).send({ data: { requestId: row.id, status } });
    },
  });
}

export default fp(leagueRoutes, { name: 'league-routes' });
