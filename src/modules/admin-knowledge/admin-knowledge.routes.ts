/**
 * @file admin-knowledge.routes.ts
 * @description Admin knowledge/CMS management — CRUD for case studies, free activities, FAQs.
 * Requires ADMIN role.
 * @module src/modules/admin-knowledge/admin-knowledge.routes
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
const IdParamSchema = z.object({ id: z.string().min(1) });

const CaseStudyCreateCanonicalSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  tag: z.string().optional(),
  order: z.number().int().optional(),
});

const CaseStudyCreateSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
    tag: z.string().optional(),
    tags: z.array(z.string()).optional(),
    order: z.number().int().optional(),
  })
  .transform((body) => ({
    title: body.title,
    body: body.body,
    tag: body.tag ?? body.tags?.[0],
    order: body.order,
  }))
  .pipe(CaseStudyCreateCanonicalSchema);

const CaseStudyUpdateCanonicalSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  tag: z.string().optional(),
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const CaseStudyUpdateSchema = z
  .object({
    title: z.string().optional(),
    body: z.string().optional(),
    tag: z.string().optional(),
    tags: z.array(z.string()).optional(),
    order: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .transform((body) => ({
    title: body.title,
    body: body.body,
    tag: body.tag ?? body.tags?.[0],
    order: body.order,
    isActive: body.isActive,
  }))
  .pipe(CaseStudyUpdateCanonicalSchema);

const FreeActivityCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  downloads: z.array(z.string().url()).min(1),
  order: z.number().int().optional(),
});

const FreeActivityUpdateSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  downloads: z.array(z.string().url()).min(1).optional(),
  isActive: z.boolean().optional(),
  order: z.number().int().optional(),
});

const FaqGroupCreateSchema = z.object({
  title: z.string().min(1),
  order: z.number().int().optional(),
  items: z.array(z.object({
    question: z.string().min(1),
    answer: z.string().min(1),
    order: z.number().int().optional(),
  })).min(1),
});

const FaqGroupUpdateSchema = z.object({
  title: z.string().optional(),
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

function mapCaseStudy(cs: {
  id: string;
  title: string;
  body: string;
  tag: string | null;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: cs.id,
    title: cs.title,
    body: cs.body,
    tag: cs.tag ?? undefined,
    tags: cs.tag ? [cs.tag] : [],
    isActive: cs.isActive,
    order: cs.order,
    createdAt: cs.createdAt.toISOString(),
    updatedAt: cs.updatedAt.toISOString(),
  };
}

function mapFreeActivityGroup(g: {
  id: string;
  title: string;
  description: string;
  isActive: boolean;
  order: number;
  createdAt: Date;
  downloads: Array<{ id: string; url: string }>;
}) {
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    isActive: g.isActive,
    order: g.order,
    createdAt: g.createdAt.toISOString(),
    downloads: g.downloads.map((d) => ({ id: d.id, url: d.url })),
  };
}

function mapFaqGroup(group: {
  id: string;
  title: string;
  isActive: boolean;
  order: number;
  items: Array<{
    id: string;
    groupId: string;
    question: string;
    answer: string;
    order: number;
  }>;
}) {
  return {
    id: group.id,
    title: group.title,
    isActive: group.isActive,
    order: group.order,
    items: group.items
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        id: item.id,
        groupId: item.groupId,
        question: item.question,
        answer: item.answer,
        order: item.order,
      })),
  };
}

async function adminKnowledgeRoutes(app: FastifyInstance): Promise<void> {
  // ─── Case Studies ─────────────────────────────────────────────────────────

  app.get('/api/v1/admin/knowledge/case-studies', {
    schema: {
      tags: ['Admin'],
      summary: 'List all case studies (including inactive)',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          isActive: { type: 'boolean' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  body: { type: 'string' },
                  tag: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                  isActive: { type: 'boolean' },
                  order: { type: 'integer' },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
              },
            },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
      },
    },
    preHandler: adminGuard,
    handler: async (
      request: FastifyRequest<{ Querystring: { isActive?: boolean; page?: number; pageSize?: number } }>,
      reply: FastifyReply,
    ) => {
      const { isActive, page = 1 } = request.query;
      const pageSize = Math.min(request.query.pageSize ?? 20, 100);
      const skip = (page - 1) * pageSize;
      const where = isActive !== undefined ? { isActive } : {};
      const [items, total] = await Promise.all([
        prisma.caseStudy.findMany({ where, skip, take: pageSize, orderBy: { order: 'asc' } }),
        prisma.caseStudy.count({ where }),
      ]);
      await reply.status(200).send({
        data: items.map(mapCaseStudy),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });

  app.get('/api/v1/admin/knowledge/case-studies/:id', {
    schema: {
      tags: ['Admin'],
      summary: 'Get case study by ID',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
    preHandler: [...adminGuard, validate({ params: IdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const cs = await prisma.caseStudy.findUnique({ where: { id: request.params.id } });
      if (!cs) throw new AppError('ACCOUNT_NOT_FOUND', 'Case study not found.', 404);
      await reply.status(200).send(mapCaseStudy(cs));
    },
  });

  app.post('/api/v1/admin/knowledge/case-studies', {
    schema: { tags: ['Admin'], summary: 'Create a case study', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ body: CaseStudyCreateSchema })],
    handler: async (request: FastifyRequest<{ Body: z.infer<typeof CaseStudyCreateSchema> }>, reply: FastifyReply) => {
      const cs = await prisma.caseStudy.create({ data: request.body });
      await reply.status(201).send(mapCaseStudy(cs));
    },
  });

  app.patch('/api/v1/admin/knowledge/case-studies/:id', {
    schema: { tags: ['Admin'], summary: 'Update a case study', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: IdParamSchema, body: CaseStudyUpdateSchema })],
    handler: async (request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof CaseStudyUpdateSchema> }>, reply: FastifyReply) => {
      const existing = await prisma.caseStudy.findUnique({ where: { id: request.params.id } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Case study not found.', 404);
      const cs = await prisma.caseStudy.update({ where: { id: request.params.id }, data: request.body });
      await reply.status(200).send(mapCaseStudy(cs));
    },
  });

  app.delete('/api/v1/admin/knowledge/case-studies/:id', {
    schema: { tags: ['Admin'], summary: 'Delete (deactivate) a case study', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: IdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const existing = await prisma.caseStudy.findUnique({ where: { id: request.params.id } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Case study not found.', 404);
      await prisma.caseStudy.update({ where: { id: request.params.id }, data: { isActive: false } });
      await reply.status(204).send();
    },
  });

  // ─── Free Activities ──────────────────────────────────────────────────────

  app.get('/api/v1/admin/knowledge/free-activities', {
    schema: {
      tags: ['Admin'],
      summary: 'List all free activity groups (including inactive)',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          isActive: { type: 'boolean' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  isActive: { type: 'boolean' },
                  order: { type: 'integer' },
                  createdAt: { type: 'string' },
                  downloads: {
                    type: 'array',
                    items: { type: 'object', properties: { id: { type: 'string' }, url: { type: 'string' } } },
                  },
                },
              },
            },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
      },
    },
    preHandler: adminGuard,
    handler: async (
      request: FastifyRequest<{ Querystring: { isActive?: boolean; page?: number; pageSize?: number } }>,
      reply: FastifyReply,
    ) => {
      const { isActive, page = 1 } = request.query;
      const pageSize = Math.min(request.query.pageSize ?? 20, 100);
      const skip = (page - 1) * pageSize;
      const where = isActive !== undefined ? { isActive } : {};
      const [items, total] = await Promise.all([
        prisma.freeActivityGroup.findMany({ where, include: { downloads: true }, skip, take: pageSize, orderBy: { order: 'asc' } }),
        prisma.freeActivityGroup.count({ where }),
      ]);
      await reply.status(200).send({
        data: items.map(mapFreeActivityGroup),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });

  app.get('/api/v1/admin/knowledge/free-activities/:id', {
    schema: {
      tags: ['Admin'],
      summary: 'Get free activity group by ID',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
    preHandler: [...adminGuard, validate({ params: IdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const group = await prisma.freeActivityGroup.findUnique({ where: { id: request.params.id }, include: { downloads: true } });
      if (!group) throw new AppError('ACCOUNT_NOT_FOUND', 'Free activity not found.', 404);
      await reply.status(200).send(mapFreeActivityGroup(group));
    },
  });

  app.post('/api/v1/admin/knowledge/free-activities', {
    schema: { tags: ['Admin'], summary: 'Create a free activity group', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ body: FreeActivityCreateSchema })],
    handler: async (request: FastifyRequest<{ Body: z.infer<typeof FreeActivityCreateSchema> }>, reply: FastifyReply) => {
      const { downloads, ...groupData } = request.body;
      const group = await prisma.freeActivityGroup.create({
        data: {
          ...groupData,
          downloads: { create: downloads.map((url) => ({ url })) },
        },
        include: { downloads: true },
      });
      await reply.status(201).send(mapFreeActivityGroup(group));
    },
  });

  app.patch('/api/v1/admin/knowledge/free-activities/:id', {
    schema: { tags: ['Admin'], summary: 'Update a free activity group', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: IdParamSchema, body: FreeActivityUpdateSchema })],
    handler: async (
      request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof FreeActivityUpdateSchema> }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.freeActivityGroup.findUnique({ where: { id: request.params.id } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Free activity not found.', 404);
      const { downloads, ...groupData } = request.body;
      const group = await prisma.freeActivityGroup.update({
        where: { id: request.params.id },
        data: {
          ...groupData,
          ...(downloads !== undefined
            ? {
                downloads: {
                  deleteMany: {},
                  create: downloads.map((url) => ({ url })),
                },
              }
            : {}),
        },
        include: { downloads: true },
      });
      await reply.status(200).send(mapFreeActivityGroup(group));
    },
  });

  app.delete('/api/v1/admin/knowledge/free-activities/:id', {
    schema: { tags: ['Admin'], summary: 'Delete (deactivate) a free activity group', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: IdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const existing = await prisma.freeActivityGroup.findUnique({ where: { id: request.params.id } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Free activity not found.', 404);
      await prisma.freeActivityGroup.update({ where: { id: request.params.id }, data: { isActive: false } });
      await reply.status(204).send();
    },
  });

  // ─── FAQs ─────────────────────────────────────────────────────────────────
  const faqBasePaths = ['/api/v1/admin/faqs', '/api/v1/admin/knowledge/faqs'] as const;

  for (const basePath of faqBasePaths) {
    app.get(basePath, {
      schema: {
        tags: ['Admin'],
        summary: 'List all FAQ groups (including inactive)',
        security: [{ BearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            isActive: { type: 'boolean' },
            page: { type: 'integer', default: 1 },
            pageSize: { type: 'integer', default: 20 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    isActive: { type: 'boolean' },
                    order: { type: 'integer' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          groupId: { type: 'string' },
                          question: { type: 'string' },
                          answer: { type: 'string' },
                          order: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
              page: { type: 'integer' },
              pageSize: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' },
            },
          },
        },
      },
      preHandler: adminGuard,
      handler: async (
        request: FastifyRequest<{ Querystring: { isActive?: boolean; page?: number; pageSize?: number } }>,
        reply: FastifyReply,
      ) => {
        const { isActive, page = 1 } = request.query;
        const pageSize = Math.min(request.query.pageSize ?? 20, 100);
        const skip = (page - 1) * pageSize;
        const where = isActive !== undefined ? { isActive } : {};
        const [items, total] = await Promise.all([
          prisma.faqGroup.findMany({
            where,
            include: { items: { orderBy: { order: 'asc' } } },
            skip,
            take: pageSize,
            orderBy: { order: 'asc' },
          }),
          prisma.faqGroup.count({ where }),
        ]);
        await reply.status(200).send({
          data: items.map(mapFaqGroup),
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        });
      },
    });

    app.get(`${basePath}/:id`, {
      schema: {
        tags: ['Admin'],
        summary: 'Get FAQ group by ID',
        security: [{ BearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
      preHandler: [...adminGuard, validate({ params: IdParamSchema })],
      handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const group = await prisma.faqGroup.findUnique({
          where: { id: request.params.id },
          include: { items: { orderBy: { order: 'asc' } } },
        });
        if (!group) throw new AppError('ACCOUNT_NOT_FOUND', 'FAQ group not found.', 404);
        await reply.status(200).send(mapFaqGroup(group));
      },
    });

    app.post(basePath, {
      schema: { tags: ['Admin'], summary: 'Create a FAQ group with items', security: [{ BearerAuth: [] }] },
      preHandler: [...adminGuard, validate({ body: FaqGroupCreateSchema })],
      handler: async (request: FastifyRequest<{ Body: z.infer<typeof FaqGroupCreateSchema> }>, reply: FastifyReply) => {
        const { items, ...groupData } = request.body;
        const group = await prisma.faqGroup.create({
          data: {
            ...groupData,
            items: { create: items },
          },
          include: { items: { orderBy: { order: 'asc' } } },
        });
        await reply.status(201).send(mapFaqGroup(group));
      },
    });

    app.patch(`${basePath}/:id`, {
      schema: { tags: ['Admin'], summary: 'Update a FAQ group', security: [{ BearerAuth: [] }] },
      preHandler: [...adminGuard, validate({ params: IdParamSchema, body: FaqGroupUpdateSchema })],
      handler: async (
        request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof FaqGroupUpdateSchema> }>,
        reply: FastifyReply,
      ) => {
        const existing = await prisma.faqGroup.findUnique({ where: { id: request.params.id } });
        if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'FAQ group not found.', 404);
        const group = await prisma.faqGroup.update({
          where: { id: request.params.id },
          data: request.body,
          include: { items: { orderBy: { order: 'asc' } } },
        });
        await reply.status(200).send(mapFaqGroup(group));
      },
    });

    app.delete(`${basePath}/:id`, {
      schema: { tags: ['Admin'], summary: 'Delete (deactivate) a FAQ group', security: [{ BearerAuth: [] }] },
      preHandler: [...adminGuard, validate({ params: IdParamSchema })],
      handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const existing = await prisma.faqGroup.findUnique({ where: { id: request.params.id } });
        if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'FAQ group not found.', 404);
        await prisma.faqGroup.update({ where: { id: request.params.id }, data: { isActive: false } });
        await reply.status(204).send();
      },
    });
  }
}

export default fp(adminKnowledgeRoutes, { name: 'admin-knowledge-routes' });
