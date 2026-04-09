/**
 * @file admin-children.routes.ts
 * @description Admin cross-parent children listing with filters and pagination.
 * @module src/modules/admin-children/admin-children.routes
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];

async function adminChildrenRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/children', {
    schema: {
      tags: ['Admin'],
      summary: 'List all children across parents (filterable)',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          parentId: { type: 'string' },
          yearGroup: { type: 'string' },
          q: { type: 'string', description: 'Search child first or last name' },
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
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  dateOfBirth: { type: 'string' },
                  gender: { type: 'string' },
                  yearGroup: { type: 'string' },
                  medicalConditions: { type: 'string' },
                  parentId: { type: 'string' },
                  parentFullName: { type: 'string' },
                  parentEmail: { type: 'string' },
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
      request: FastifyRequest<{
        Querystring: { parentId?: string; yearGroup?: string; q?: string; page?: number; pageSize?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const { parentId, yearGroup, q, page = 1 } = request.query;
      const pageSize = Math.min(request.query.pageSize ?? 20, 100);
      const skip = (page - 1) * pageSize;

      const where = {
        ...(parentId && { userId: parentId }),
        ...(yearGroup && { yearGroup }),
        ...(q && {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' as const } },
            { lastName: { contains: q, mode: 'insensitive' as const } },
          ],
        }),
      };

      const [rows, total] = await Promise.all([
        prisma.child.findMany({
          where,
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
          skip,
          take: pageSize,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        }),
        prisma.child.count({ where }),
      ]);

      await reply.status(200).send({
        data: rows.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          dateOfBirth: c.dateOfBirth.toISOString().split('T')[0],
          gender: c.gender,
          yearGroup: c.yearGroup,
          medicalConditions: c.medicalConditions ?? undefined,
          parentId: c.user.id,
          parentFullName: `${c.user.firstName} ${c.user.lastName}`.trim(),
          parentEmail: c.user.email,
        })),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });
}

export default fp(adminChildrenRoutes, { name: 'admin-children-routes' });
