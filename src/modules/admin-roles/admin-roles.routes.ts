/**
 * @file admin-roles.routes.ts
 * @description Admin roles management — manage admin users. Requires ADMIN role.
 * @module src/modules/admin-roles/admin-roles.routes
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';
import { hashPassword } from '@/shared/utils/hash.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];
const UserIdParamSchema = z.object({ userId: z.string().min(1) });

const CreateAdminUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

const UpdateAdminUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
});

const adminUserSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    role: { type: 'string' },
    createdAt: { type: 'string' },
  },
};

async function adminRolesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/users', {
    schema: {
      tags: ['Admin'],
      summary: 'List all admin users',
      security: [{ BearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: adminUserSchema },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
      },
    },
    preHandler: adminGuard,
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      const data = admins.map((a) => ({ ...a, role: 'admin', createdAt: a.createdAt.toISOString() }));
      await reply.status(200).send({
        data,
        page: 1,
        pageSize: Math.max(data.length, 1),
        total: data.length,
        totalPages: 1,
      });
    },
  });

  app.post('/api/v1/admin/users', {
    schema: {
      tags: ['Admin'],
      summary: 'Create a new admin user',
      security: [{ BearerAuth: [] }],
      response: { 201: adminUserSchema },
    },
    preHandler: [...adminGuard, validate({ body: CreateAdminUserSchema })],
    handler: async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateAdminUserSchema> }>,
      reply: FastifyReply,
    ) => {
      const { email, password, firstName, lastName } = request.body;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new AppError('EMAIL_ALREADY_EXISTS', 'An account with this email already exists.', 409);
      }

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: { email, passwordHash, firstName, lastName, role: 'ADMIN' },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
      });

      await reply.status(201).send({ ...user, role: 'admin', createdAt: user.createdAt.toISOString() });
    },
  });

  app.patch('/api/v1/admin/users/:userId', {
    schema: {
      tags: ['Admin'],
      summary: 'Update an admin user name or password',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { userId: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          password: { type: 'string', minLength: 8 },
        },
      },
      response: { 200: adminUserSchema },
    },
    preHandler: [...adminGuard, validate({ params: UserIdParamSchema, body: UpdateAdminUserSchema })],
    handler: async (
      request: FastifyRequest<{ Params: { userId: string }; Body: z.infer<typeof UpdateAdminUserSchema> }>,
      reply: FastifyReply,
    ) => {
      const user = await prisma.user.findFirst({
        where: { id: request.params.userId, role: 'ADMIN' },
      });
      if (!user) throw new AppError('ACCOUNT_NOT_FOUND', 'Admin user not found.', 404);

      const { password, ...rest } = request.body;
      const updated = await prisma.user.update({
        where: { id: request.params.userId },
        data: {
          ...rest,
          ...(password && { passwordHash: await hashPassword(password) }),
        },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
      });

      await reply.status(200).send({ ...updated, role: 'admin', createdAt: updated.createdAt.toISOString() });
    },
  });

  app.delete('/api/v1/admin/users/:userId', {
    schema: {
      tags: ['Admin'],
      summary: 'Remove an admin user (cannot remove yourself)',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { userId: { type: 'string' } } },
      response: { 204: { type: 'null' } },
    },
    preHandler: [...adminGuard, validate({ params: UserIdParamSchema })],
    handler: async (
      request: FastifyRequest<{ Params: { userId: string } }>,
      reply: FastifyReply,
    ) => {
      if (request.params.userId === request.user!.id) {
        throw new AppError('VALIDATION_ERROR', 'You cannot remove your own admin account.', 422);
      }

      const user = await prisma.user.findFirst({
        where: { id: request.params.userId, role: 'ADMIN' },
      });
      if (!user) throw new AppError('ACCOUNT_NOT_FOUND', 'Admin user not found.', 404);

      await prisma.user.delete({ where: { id: request.params.userId } });
      await reply.status(204).send();
    },
  });
}

export default fp(adminRolesRoutes, { name: 'admin-roles-routes' });
