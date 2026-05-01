/**
 * @file admin-children.routes.ts
 * @description Admin cross-parent children listing with filters and pagination.
 * @module src/modules/admin-children/admin-children.routes
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
const ChildIdParamSchema = z.object({ childId: z.string().min(1) });
const UpdateAdminChildSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  yearGroup: z.string().optional(),
  medicalConditions: z.string().optional(),
  emergencyNote: z.string().optional(),
  isActive: z.boolean().optional(),
});

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
                  isActive: { type: 'boolean' },
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
          // Keep ordering stable across edits so a renamed record does not "disappear"
          // by moving to another pagination page.
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
          isActive: c.isActive,
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

  app.patch('/api/v1/admin/children/:childId', {
    schema: {
      tags: ['Admin'],
      summary: 'Update any child profile by id',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { childId: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          dateOfBirth: { type: 'string' },
          gender: { type: 'string' },
          yearGroup: { type: 'string' },
          medicalConditions: { type: 'string' },
          emergencyNote: { type: 'string' },
          isActive: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            dateOfBirth: { type: 'string' },
            gender: { type: 'string' },
            yearGroup: { type: 'string' },
            medicalConditions: { type: 'string' },
            isActive: { type: 'boolean' },
            parentId: { type: 'string' },
            parentFullName: { type: 'string' },
            parentEmail: { type: 'string' },
          },
        },
      },
    },
    preHandler: [...adminGuard, validate({ params: ChildIdParamSchema, body: UpdateAdminChildSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: z.infer<typeof ChildIdParamSchema>;
        Body: z.infer<typeof UpdateAdminChildSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.child.findUnique({
        where: { id: request.params.childId },
        select: { id: true },
      });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Child not found.', 404);

      const parsedDob = request.body.dateOfBirth ? new Date(request.body.dateOfBirth) : undefined;
      if (parsedDob && Number.isNaN(parsedDob.getTime())) {
        throw new AppError('VALIDATION_ERROR', 'Invalid dateOfBirth.', 422);
      }

      const updated = await prisma.child.update({
        where: { id: request.params.childId },
        data: {
          ...(request.body.firstName !== undefined ? { firstName: request.body.firstName.trim() } : {}),
          ...(request.body.lastName !== undefined ? { lastName: request.body.lastName.trim() } : {}),
          ...(parsedDob ? { dateOfBirth: parsedDob } : {}),
          ...(request.body.gender !== undefined ? { gender: request.body.gender } : {}),
          ...(request.body.yearGroup !== undefined ? { yearGroup: request.body.yearGroup } : {}),
          ...(request.body.isActive !== undefined ? { isActive: request.body.isActive } : {}),
          ...(request.body.medicalConditions !== undefined
            ? { medicalConditions: request.body.medicalConditions }
            : {}),
          ...(request.body.emergencyNote !== undefined ? { emergencyNote: request.body.emergencyNote } : {}),
        },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      });

      await reply.status(200).send({
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        dateOfBirth: updated.dateOfBirth.toISOString().split('T')[0],
        gender: updated.gender,
        yearGroup: updated.yearGroup,
        medicalConditions: updated.medicalConditions ?? undefined,
        isActive: updated.isActive,
        parentId: updated.user.id,
        parentFullName: `${updated.user.firstName} ${updated.user.lastName}`.trim(),
        parentEmail: updated.user.email,
      });
    },
  });

  app.delete('/api/v1/admin/children/:childId', {
    schema: {
      tags: ['Admin'],
      summary: 'Delete any child profile by id',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { childId: { type: 'string' } } },
      response: {
        204: { type: 'null' },
      },
    },
    preHandler: [...adminGuard, validate({ params: ChildIdParamSchema })],
    handler: async (
      request: FastifyRequest<{ Params: z.infer<typeof ChildIdParamSchema> }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.child.findUnique({
        where: { id: request.params.childId },
        select: { id: true },
      });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Child not found.', 404);

      await prisma.child.delete({ where: { id: request.params.childId } });
      await reply.status(204).send();
    },
  });
}

export default fp(adminChildrenRoutes, { name: 'admin-children-routes' });
