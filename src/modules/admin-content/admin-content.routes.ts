/**
 * @file admin-content.routes.ts
 * @description Admin site-wide CMS: stats, testimonials, partners, named image slots.
 * @module src/modules/admin-content/admin-content.routes
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { AppError } from '@/shared/errors/AppError.js';
import { NAMED_CONTENT_SLOTS } from '@/shared/constants/content-slots.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];

const DEFAULT_STATS = [
  { key: 'schools', value: '50', suffix: '+', label: 'Schools Onboarded' },
  { key: 'children', value: '1200', suffix: '+', label: 'Children Coached' },
  { key: 'districts', value: '12', suffix: '', label: 'Districts Covered' },
  { key: 'staff', value: '30', suffix: '+', label: 'Staff Members' },
] as const;

const PatchContentSchema = z.object({
  stats: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string(),
        suffix: z.string(),
        label: z.string().min(1),
      }),
    )
    .optional(),
  testimonials: z
    .array(
      z.object({
        id: z.string().optional(),
        quote: z.string().min(1),
        speaker: z.string().min(1),
        role: z.string().min(1),
        order: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  partners: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        description: z.string().min(1),
        type: z.string().min(1),
      }),
    )
    .optional(),
});

const PatchSlotSchema = z.object({
  slot: z.string().min(1),
  mediaId: z.string().min(1).nullable(),
});

async function ensureContentDefaults(): Promise<void> {
  await prisma.$transaction(
    DEFAULT_STATS.map((s) =>
      prisma.contentStat.upsert({
        where: { key: s.key },
        create: { ...s },
        update: {},
      }),
    ),
  );
  await Promise.all(
    NAMED_CONTENT_SLOTS.map((slot) =>
      prisma.contentMediaSlot.upsert({
        where: { slot },
        create: { slot, mediaId: null },
        update: {},
      }),
    ),
  );
}

async function buildContentResponse() {
  const [stats, testimonials, partners, slots] = await Promise.all([
    prisma.contentStat.findMany({ orderBy: { key: 'asc' } }),
    prisma.testimonial.findMany({ orderBy: { order: 'asc' } }),
    prisma.partner.findMany({ orderBy: { name: 'asc' } }),
    prisma.contentMediaSlot.findMany({ include: { media: true } }),
  ]);

  const slotMap = new Map(slots.map((s) => [s.slot, s]));
  const named = [...NAMED_CONTENT_SLOTS] as string[];
  const orderedSlots: string[] = [...named];
  for (const s of slots) {
    if (!orderedSlots.includes(s.slot)) orderedSlots.push(s.slot);
  }
  const mergedSlots = orderedSlots.map((slot) => {
    const row = slotMap.get(slot);
    return {
      slot,
      mediaId: row?.mediaId ?? undefined,
      media: row?.media
        ? { id: row.media.id, url: row.media.url, name: row.media.name }
        : undefined,
    };
  });

  return {
    stats: stats.map((s) => ({
      key: s.key,
      value: s.value,
      suffix: s.suffix,
      label: s.label,
    })),
    testimonials: testimonials.map((t) => ({
      id: t.id,
      quote: t.quote,
      speaker: t.speaker,
      role: t.role,
      order: t.order,
    })),
    partners: partners.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      type: p.type,
    })),
    slots: mergedSlots,
  };
}

async function adminContentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/content', {
    schema: { tags: ['Admin'], summary: 'Get site CMS payload', security: [{ BearerAuth: [] }] },
    preHandler: adminGuard,
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      await ensureContentDefaults();
      await reply.status(200).send(await buildContentResponse());
    },
  });

  app.patch('/api/v1/admin/content', {
    schema: { tags: ['Admin'], summary: 'Update CMS stats / testimonials / partners', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ body: PatchContentSchema })],
    handler: async (request: FastifyRequest<{ Body: z.infer<typeof PatchContentSchema> }>, reply: FastifyReply) => {
      const { stats, testimonials, partners } = request.body;

      if (stats?.length) {
        await prisma.$transaction(
          stats.map((s) =>
            prisma.contentStat.upsert({
              where: { key: s.key },
              create: s,
              update: { value: s.value, suffix: s.suffix, label: s.label },
            }),
          ),
        );
      }

      if (testimonials?.length) {
        for (const t of testimonials) {
          if (t.id) {
            const ex = await prisma.testimonial.findUnique({ where: { id: t.id } });
            if (ex) {
              await prisma.testimonial.update({
                where: { id: t.id },
                data: { quote: t.quote, speaker: t.speaker, role: t.role, order: t.order },
              });
            } else {
              await prisma.testimonial.create({
                data: { id: t.id, quote: t.quote, speaker: t.speaker, role: t.role, order: t.order },
              });
            }
          } else {
            await prisma.testimonial.create({
              data: { quote: t.quote, speaker: t.speaker, role: t.role, order: t.order },
            });
          }
        }
      }

      if (partners?.length) {
        for (const p of partners) {
          if (p.id) {
            const ex = await prisma.partner.findUnique({ where: { id: p.id } });
            if (ex) {
              await prisma.partner.update({
                where: { id: p.id },
                data: { name: p.name, description: p.description, type: p.type },
              });
            } else {
              await prisma.partner.create({
                data: { id: p.id, name: p.name, description: p.description, type: p.type },
              });
            }
          } else {
            await prisma.partner.create({
              data: { name: p.name, description: p.description, type: p.type },
            });
          }
        }
      }

      await ensureContentDefaults();
      await reply.status(200).send(await buildContentResponse());
    },
  });

  app.patch('/api/v1/admin/content/slots', {
    schema: { tags: ['Admin'], summary: 'Assign media to a named slot', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ body: PatchSlotSchema })],
    handler: async (request: FastifyRequest<{ Body: z.infer<typeof PatchSlotSchema> }>, reply: FastifyReply) => {
      const { slot, mediaId } = request.body;
      if (mediaId) {
        const media = await prisma.mediaAsset.findUnique({ where: { id: mediaId } });
        if (!media) throw new AppError('ACCOUNT_NOT_FOUND', 'Media not found.', 404);
      }
      const row = await prisma.contentMediaSlot.upsert({
        where: { slot },
        create: { slot, mediaId },
        update: { mediaId },
        include: { media: true },
      });
      await reply.status(200).send({
        slot: row.slot,
        mediaId: row.mediaId,
        media: row.media ? { id: row.media.id, url: row.media.url, name: row.media.name } : undefined,
      });
    },
  });
}

export default fp(adminContentRoutes, { name: 'admin-content-routes' });
