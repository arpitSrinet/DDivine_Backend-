/**
 * @file admin-media.routes.ts
 * @description Admin media library — list, multipart upload, delete (blocked when in use).
 * @module src/modules/admin-media/admin-media.routes
 */
import { createWriteStream, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { env } from '@/config/env.js';
import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];
const MediaIdParam = z.object({ mediaId: z.string().min(1) });

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

function extForMime(mime: string): string {
  const m: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  return m[mime] ?? '.bin';
}

async function countMediaUsage(mediaId: string): Promise<number> {
  const [a, b, c, d] = await Promise.all([
    prisma.contentMediaSlot.count({ where: { mediaId } }),
    prisma.calendarEvent.count({ where: { bannerId: mediaId } }),
    prisma.team.count({ where: { photoId: mediaId } }),
    prisma.match.count({ where: { photoId: mediaId } }),
  ]);
  return a + b + c + d;
}

async function saveStreamToUploads(
  stream: NodeJS.ReadableStream,
  mimetype: string,
  originalFilename: string,
): Promise<{ url: string; size: number; name: string }> {
  if (!IMAGE_MIMES.has(mimetype)) {
    throw new AppError('VALIDATION_ERROR', `Unsupported file type: ${mimetype}`, 422);
  }
  const uploadsDir = resolve(process.cwd(), env.UPLOADS_DIR);
  mkdirSync(uploadsDir, { recursive: true });
  const ext = extForMime(mimetype);
  const safeBase = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'upload';
  const filename = `${randomUUID()}-${safeBase}${ext}`;
  const destPath = join(uploadsDir, filename);
  let size = 0;
  const { Transform } = await import('node:stream');
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > MAX_BYTES) {
        cb(new AppError('VALIDATION_ERROR', 'File exceeds the 5 MB size limit.', 422));
        return;
      }
      cb(null, chunk);
    },
  });
  await pipeline(stream, counter, createWriteStream(destPath));
  const baseUrl = env.BASE_URL.replace(/\/+$/, '');
  return { url: `${baseUrl}/uploads/${filename}`, size, name: originalFilename || filename };
}

async function adminMediaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/media', {
    schema: {
      tags: ['Admin'],
      summary: 'List media assets',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
    },
    preHandler: adminGuard,
    handler: async (
      request: FastifyRequest<{ Querystring: { q?: string; page?: number; pageSize?: number } }>,
      reply: FastifyReply,
    ) => {
      const { q, page = 1 } = request.query;
      const pageSize = Math.min(request.query.pageSize ?? 20, 100);
      const skip = (page - 1) * pageSize;
      const where = q ? { name: { contains: q, mode: 'insensitive' as const } } : {};
      const [rows, total] = await Promise.all([
        prisma.mediaAsset.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
        prisma.mediaAsset.count({ where }),
      ]);
      const data = await Promise.all(
        rows.map(async (m) => ({
          id: m.id,
          name: m.name,
          url: m.url,
          size: m.size,
          width: m.width ?? undefined,
          height: m.height ?? undefined,
          inUseSlotCount: await countMediaUsage(m.id),
          createdAt: m.createdAt.toISOString(),
        })),
      );
      await reply.status(200).send({ data, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
    },
  });

  app.post('/api/v1/admin/media', {
    schema: {
      tags: ['Admin'],
      summary: 'Upload one or more images (multipart — file parts)',
      security: [{ BearerAuth: [] }],
      consumes: ['multipart/form-data'],
    },
    preHandler: adminGuard,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const created: Array<{
        id: string;
        name: string;
        url: string;
        size: number;
        width?: number;
        height?: number;
        createdAt: string;
      }> = [];

      for await (const part of request.parts()) {
        if (part.type !== 'file') continue;
        const { file, filename, mimetype } = part;
        const { url, size, name } = await saveStreamToUploads(file, mimetype, filename);
        const row = await prisma.mediaAsset.create({
          data: { name, url, size, width: null, height: null },
        });
        created.push({
          id: row.id,
          name: row.name,
          url: row.url,
          size: row.size,
          createdAt: row.createdAt.toISOString(),
        });
      }

      if (created.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'No files received. Send one or more image parts.', 422);
      }

      await reply.status(201).send(created);
    },
  });

  app.delete('/api/v1/admin/media/:mediaId', {
    schema: { tags: ['Admin'], summary: 'Delete media if unused', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: MediaIdParam })],
    handler: async (request: FastifyRequest<{ Params: { mediaId: string } }>, reply: FastifyReply) => {
      const row = await prisma.mediaAsset.findUnique({ where: { id: request.params.mediaId } });
      if (!row) throw new AppError('ACCOUNT_NOT_FOUND', 'Media not found.', 404);
      const n = await countMediaUsage(request.params.mediaId);
      if (n > 0) {
        return reply.status(409).send({
          error: `This image is assigned to ${n} content slot(s). Reassign them before deleting.`,
        });
      }
      await prisma.mediaAsset.delete({ where: { id: request.params.mediaId } });
      await reply.status(204).send();
    },
  });
}

export default fp(adminMediaRoutes, { name: 'admin-media-routes' });
