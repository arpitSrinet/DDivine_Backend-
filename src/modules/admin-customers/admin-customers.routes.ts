/**
 * @file admin-customers.routes.ts
 * @description Admin customer management — list, view, and update PARENT and SCHOOL user accounts.
 * Requires ADMIN role.
 * @module src/modules/admin-customers/admin-customers.routes
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
const CustomerIdParamSchema = z.object({ customerId: z.string().min(1) });

const UpdateCustomerSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  town: z.string().optional(),
  county: z.string().optional(),
  postcode: z.string().optional(),
});

const customerSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    role: { type: 'string' },
    phone: { type: 'string' },
    schoolName: { type: 'string' },
    addressLine1: { type: 'string' },
    addressLine2: { type: 'string' },
    town: { type: 'string' },
    county: { type: 'string' },
    postcode: { type: 'string' },
    totalBookings: { type: 'integer' },
    createdAt: { type: 'string' },
  },
};

const customerDetailSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    role: { type: 'string' },
    phone: { type: 'string' },
    schoolName: { type: 'string' },
    addressLine1: { type: 'string' },
    addressLine2: { type: 'string' },
    town: { type: 'string' },
    county: { type: 'string' },
    postcode: { type: 'string' },
    createdAt: { type: 'string' },
    children: {
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
        },
      },
    },
    bookings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          serviceName: { type: 'string' },
          date: { type: 'string' },
          status: { type: 'string' },
          price: { type: 'number' },
          createdAt: { type: 'string' },
        },
      },
    },
  },
};

async function adminCustomersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/customers', {
    schema: {
      tags: ['Admin'],
      summary: 'List all PARENT and SCHOOL users with optional filters and pagination',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['PARENT', 'SCHOOL'] },
          search: { type: 'string', description: 'Search by name or email' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: customerSchema },
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
        Querystring: { role?: 'PARENT' | 'SCHOOL'; search?: string; page?: number; pageSize?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const { role, search, page = 1 } = request.query;
      const pageSize = Math.min(request.query.pageSize ?? 20, 100);
      const skip = (page - 1) * pageSize;

      const where = {
        role: role ? { equals: role as 'PARENT' | 'SCHOOL' } : { in: ['PARENT', 'SCHOOL'] as ('PARENT' | 'SCHOOL')[] },
        ...(search && {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
      };

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            phone: true,
            schoolName: true,
            addressLine1: true,
            addressLine2: true,
            town: true,
            county: true,
            postcode: true,
            createdAt: true,
            _count: { select: { bookings: true } },
          },
          skip,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
      ]);

      await reply.status(200).send({
        data: users.map((u) => ({
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role.toLowerCase(),
          phone: u.phone ?? undefined,
          schoolName: u.schoolName ?? undefined,
          addressLine1: u.addressLine1 ?? undefined,
          addressLine2: u.addressLine2 ?? undefined,
          town: u.town ?? undefined,
          county: u.county ?? undefined,
          postcode: u.postcode ?? undefined,
          totalBookings: u._count.bookings,
          createdAt: u.createdAt.toISOString(),
        })),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });

  app.get('/api/v1/admin/customers/:customerId', {
    schema: {
      tags: ['Admin'],
      summary: 'Get full customer profile with children and booking history',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { customerId: { type: 'string' } } },
      response: { 200: customerDetailSchema },
    },
    preHandler: [...adminGuard, validate({ params: CustomerIdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: { customerId: string } }>, reply: FastifyReply) => {
      const user = await prisma.user.findFirst({
        where: { id: request.params.customerId, role: { in: ['PARENT', 'SCHOOL'] } },
        include: {
          children: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              gender: true,
              yearGroup: true,
            },
          },
          bookings: {
            include: { session: { include: { service: true } } },
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
        },
      });

      if (!user) throw new AppError('ACCOUNT_NOT_FOUND', 'Customer not found.', 404);

      await reply.status(200).send({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.toLowerCase(),
        phone: user.phone ?? undefined,
        schoolName: user.schoolName ?? undefined,
        addressLine1: user.addressLine1 ?? undefined,
        addressLine2: user.addressLine2 ?? undefined,
        town: user.town ?? undefined,
        county: user.county ?? undefined,
        postcode: user.postcode ?? undefined,
        createdAt: user.createdAt.toISOString(),
        children: user.children.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          dateOfBirth: c.dateOfBirth.toISOString().split('T')[0],
          gender: c.gender,
          yearGroup: c.yearGroup,
        })),
        bookings: user.bookings.map((b) => ({
          id: b.id,
          serviceName: b.session.service.title,
          date: b.session.date.toISOString(),
          status: b.status.toLowerCase(),
          price: b.price.toNumber(),
          createdAt: b.createdAt.toISOString(),
        })),
      });
    },
  });

  app.patch('/api/v1/admin/customers/:customerId', {
    schema: {
      tags: ['Admin'],
      summary: 'Update a customer profile',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { customerId: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          addressLine1: { type: 'string' },
          addressLine2: { type: 'string' },
          town: { type: 'string' },
          county: { type: 'string' },
          postcode: { type: 'string' },
        },
      },
      response: { 200: customerSchema },
    },
    preHandler: [...adminGuard, validate({ params: CustomerIdParamSchema, body: UpdateCustomerSchema })],
    handler: async (
      request: FastifyRequest<{ Params: { customerId: string }; Body: z.infer<typeof UpdateCustomerSchema> }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.user.findFirst({
        where: { id: request.params.customerId, role: { in: ['PARENT', 'SCHOOL'] } },
      });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Customer not found.', 404);

      const updated = await prisma.user.update({
        where: { id: request.params.customerId },
        data: request.body,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          phone: true,
          schoolName: true,
          addressLine1: true,
          addressLine2: true,
          town: true,
          county: true,
          postcode: true,
          createdAt: true,
          _count: { select: { bookings: true } },
        },
      });

      await reply.status(200).send({
        id: updated.id,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        role: updated.role.toLowerCase(),
        phone: updated.phone ?? undefined,
        schoolName: updated.schoolName ?? undefined,
        addressLine1: updated.addressLine1 ?? undefined,
        addressLine2: updated.addressLine2 ?? undefined,
        town: updated.town ?? undefined,
        county: updated.county ?? undefined,
        postcode: updated.postcode ?? undefined,
        totalBookings: updated._count.bookings,
        createdAt: updated.createdAt.toISOString(),
      });
    },
  });
}

export default fp(adminCustomersRoutes, { name: 'admin-customers-routes' });
