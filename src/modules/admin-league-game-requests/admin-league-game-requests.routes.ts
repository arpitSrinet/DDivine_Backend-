/**
 * @file admin-league-game-requests.routes.ts
 * @description Admin approval workflow for league game requests.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import nodemailer from 'nodemailer';
import { z } from 'zod';

import { env } from '@/config/env.js';
import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];

const RequestIdParam = z.object({ requestId: z.string().min(1) });

const ListQuerySchema = z.object({
  status: z.enum(['SUBMITTED', 'APPROVED', 'REJECTED']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const ApproveBodySchema = z.object({
  notifySchoolsPostcode: z
    .string()
    .trim()
    .max(16)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  notifySchoolsRadiusKm: z.coerce.number().positive().optional(),
});

const RejectBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

function getTransporter() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}

function normalizePostcode(postcode: string): string {
  return postcode.trim().toUpperCase().replace(/\s+/g, '');
}

async function geocodePostcode(postcode: string): Promise<{ latitude: number; longitude: number } | null> {
  const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    status?: number;
    result?: { latitude?: number | null; longitude?: number | null } | null;
  };
  const latitude = payload.result?.latitude;
  const longitude = payload.result?.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  return { latitude, longitude };
}

async function geocodeAddress(query: string): Promise<{ latitude: number; longitude: number } | null> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
    { headers: { Accept: 'application/json', 'User-Agent': 'DDivine-Backend/1.0' } },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as Array<{ lat?: string; lon?: string }>;
  const first = payload[0];
  if (!first?.lat || !first?.lon) return null;
  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

async function geocodePostcodesBulk(
  postcodes: string[],
): Promise<Map<string, { latitude: number; longitude: number }>> {
  const map = new Map<string, { latitude: number; longitude: number }>();
  const rawByNormalized = new Map<string, string>();
  for (const raw of postcodes) {
    const normalized = normalizePostcode(raw);
    if (!normalized) continue;
    if (!rawByNormalized.has(normalized)) rawByNormalized.set(normalized, raw.trim());
  }
  const unique = [...rawByNormalized.keys()];
  const chunkSize = 100;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const response = await fetch('https://api.postcodes.io/postcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcodes: chunk }),
    });
    if (!response.ok) continue;
    const payload = (await response.json()) as {
      status?: number;
      result?: Array<{ query?: string; result?: { latitude?: number | null; longitude?: number | null } | null }>;
    };
    for (const item of payload.result ?? []) {
      const query = item.query ? normalizePostcode(item.query) : null;
      const lat = item.result?.latitude;
      const lng = item.result?.longitude;
      if (!query || typeof lat !== 'number' || typeof lng !== 'number') continue;
      map.set(query, { latitude: lat, longitude: lng });
    }
  }

  for (const normalized of unique) {
    if (map.has(normalized)) continue;
    const fallback = rawByNormalized.get(normalized) ?? normalized;
    const geo = await geocodeAddress(fallback);
    if (geo) map.set(normalized, geo);
  }

  return map;
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function formatLocationFromRequest(r: {
  addressLine1: string;
  addressLine2: string | null;
  town: string;
  postCode: string;
}): string {
  return [r.addressLine1, r.addressLine2, r.town, r.postCode].filter(Boolean).join(', ');
}

const NotifyPreviewBodySchema = z.object({
  postcode: z.string().trim().min(1).max(16),
  radiusKm: z.coerce.number().positive(),
});

async function adminLeagueGameRequestsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/admin/league/game-requests/notify-preview', {
    schema: { tags: ['Admin'], summary: 'Preview schools that would be notified', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ body: NotifyPreviewBodySchema })],
    handler: async (
      request: FastifyRequest<{ Body: z.infer<typeof NotifyPreviewBodySchema> }>,
      reply: FastifyReply,
    ) => {
      const { postcode, radiusKm } = request.body;
      const normalized = normalizePostcode(postcode);
      const center = (await geocodePostcode(normalized)) ?? (await geocodeAddress(postcode));
      if (!center) {
        throw new AppError('VALIDATION_ERROR', 'Could not resolve the postcode.', 422);
      }

      const schools = await prisma.user.findMany({
        where: { role: 'SCHOOL', schoolApprovalStatus: 'APPROVED', postcode: { not: null } },
        select: { email: true, postcode: true },
      });

      const geoMap = await geocodePostcodesBulk(schools.map((s) => s.postcode ?? ''));
      const seen = new Set<string>();

      for (const school of schools) {
        const email = school.email.trim();
        const pc = school.postcode ? normalizePostcode(school.postcode) : '';
        if (!pc || !email) continue;
        const geo = geoMap.get(pc);
        if (!geo) continue;
        if (distanceKm(center.latitude, center.longitude, geo.latitude, geo.longitude) > radiusKm) continue;
        const key = email.toLowerCase();
        if (!seen.has(key)) seen.add(key);
      }

      await reply.status(200).send({ data: { count: seen.size, centerPostcode: normalized, radiusKm } });
    },
  });

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
    schema: { tags: ['Admin'], summary: 'Approve league game request and notify nearby schools', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: RequestIdParam, body: ApproveBodySchema })],
    handler: async (
      request: FastifyRequest<{ Params: z.infer<typeof RequestIdParam>; Body: z.infer<typeof ApproveBodySchema> }>,
      reply: FastifyReply,
    ) => {
      const adminId = request.user!.id;
      const { requestId } = request.params;
      const body = request.body;

      const r = await prisma.leagueGameRequest.findUnique({ where: { id: requestId } });
      if (!r) throw new AppError('ACCOUNT_NOT_FOUND', 'Game request not found.', 404);
      if (r.status !== 'SUBMITTED') {
        throw new AppError('VALIDATION_ERROR', `Only SUBMITTED requests can be approved (current: ${r.status}).`, 400);
      }

      const updatedRequest = await prisma.leagueGameRequest.update({
        where: { id: r.id },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          reviewedByAdminId: adminId,
          rejectionReason: null,
        },
      });

      // --- Radius notification ---
      let notifiedSchools = 0;
      const { notifySchoolsPostcode, notifySchoolsRadiusKm } = body;

      if (notifySchoolsPostcode && notifySchoolsRadiusKm && env.SMTP_HOST) {
        const normalizedCenter = normalizePostcode(notifySchoolsPostcode);
        const center =
          (await geocodePostcode(normalizedCenter)) ?? (await geocodeAddress(normalizedCenter));

        if (center) {
          const schools = await prisma.user.findMany({
            where: { role: 'SCHOOL', schoolApprovalStatus: 'APPROVED', postcode: { not: null } },
            select: { email: true, postcode: true, schoolName: true },
          });

          const geoMap = await geocodePostcodesBulk(schools.map((s) => s.postcode ?? ''));
          const recipients: string[] = [];
          const seen = new Set<string>();

          for (const school of schools) {
            const email = school.email.trim();
            const postcode = school.postcode ? normalizePostcode(school.postcode) : '';
            if (!postcode || !email) continue;
            const geo = geoMap.get(postcode);
            if (!geo) continue;
            if (distanceKm(center.latitude, center.longitude, geo.latitude, geo.longitude) > notifySchoolsRadiusKm) {
              continue;
            }
            const key = email.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            recipients.push(email);
          }

          const gameDate = r.gameDate.toISOString().split('T')[0];
          const gameTime = r.gameTime;
          const gameAddress = formatLocationFromRequest(r);
          const subject = 'New School League Game Approved Near You';
          const html = `
            <div style="font-family: sans-serif; color: #333;">
              <p>Hello,</p>
              <p>A school league game has been approved in your area:</p>
              <table style="border-collapse: collapse; margin: 12px 0;">
                <tr>
                  <td style="padding: 4px 12px 4px 0;"><strong>Year Group:</strong></td>
                  <td>${r.yearGroup}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 12px 4px 0;"><strong>Date:</strong></td>
                  <td>${gameDate}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 12px 4px 0;"><strong>Time:</strong></td>
                  <td>${gameTime}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 12px 4px 0;"><strong>Location:</strong></td>
                  <td>${gameAddress}</td>
                </tr>
              </table>
              <p style="color: #666; font-size: 13px;">
                This notification was sent to approved schools within ${notifySchoolsRadiusKm} km of ${normalizedCenter}.
              </p>
              <p>— DDivine Admin Team</p>
            </div>
          `;

          if (recipients.length > 0) {
            const transporter = getTransporter();
            const batchSize = 50;
            for (let i = 0; i < recipients.length; i += batchSize) {
              const batch = recipients.slice(i, i + batchSize);
              await transporter.sendMail({
                from: env.EMAIL_FROM,
                to: env.EMAIL_FROM,
                bcc: batch.join(','),
                subject,
                html,
              });
              notifiedSchools += batch.length;
            }
          }

          await prisma.schoolGroupEmailLog.create({
            data: {
              subject,
              message: `League game request ${requestId} approved | radius=${notifySchoolsRadiusKm}km | center=${normalizedCenter}`,
              targetStatus: 'game-approval',
              recipientsCount: recipients.length,
              sentCount: notifiedSchools,
              sentByAdminId: adminId,
            },
          });
        }
      }
      // ---

      await reply.status(200).send({
        data: {
          id: updatedRequest.id,
          status: updatedRequest.status,
          reviewedAt: updatedRequest.reviewedAt?.toISOString() ?? null,
          reviewedByAdminId: updatedRequest.reviewedByAdminId ?? null,
          notifiedSchools,
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

