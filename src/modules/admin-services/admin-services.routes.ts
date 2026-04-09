/**
 * @file admin-services.routes.ts
 * @description Admin services management — full CRUD for the service catalogue.
 * Services are the top-level categories (Curricular, Extra-Curricular, etc.) that sessions belong to.
 * Requires ADMIN role.
 * @module src/modules/admin-services/admin-services.routes
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
const ServiceIdParamSchema = z.object({ serviceId: z.string().min(1) });

const SERVICE_KEY_VALUES = ['CURRICULAR', 'EXTRA_CURRICULAR', 'HOLIDAY_CAMPS', 'WRAPAROUND'] as const;
const SERVICE_KEY_MAP: Record<string, string> = {
  CURRICULAR: 'curricular',
  EXTRA_CURRICULAR: 'extraCurricular',
  HOLIDAY_CAMPS: 'holidayCamps',
  WRAPAROUND: 'wraparound',
};

const CreateServiceCanonicalSchema = z.object({
  key: z.enum(SERVICE_KEY_VALUES),
  title: z.string().min(1),
  summary: z.string().min(1),
  imageSrc: z.string().min(1),
  imageAlt: z.string().min(1),
});

const CreateServiceSchema = z
  .object({
    key: z.enum(SERVICE_KEY_VALUES),
    title: z.string().optional(),
    summary: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    imageSrc: z.string().min(1),
    imageAlt: z.string().min(1),
  })
  .transform((body) => ({
    key: body.key,
    title: body.title ?? body.name,
    summary: body.summary ?? body.description,
    imageSrc: body.imageSrc,
    imageAlt: body.imageAlt,
  }))
  .pipe(CreateServiceCanonicalSchema);

const UpdateServiceCanonicalSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  imageSrc: z.string().min(1).optional(),
  imageAlt: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const UpdateServiceSchema = z
  .object({
    title: z.string().optional(),
    summary: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    imageSrc: z.string().optional(),
    imageAlt: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .transform((body) => ({
    title: body.title ?? body.name,
    summary: body.summary ?? body.description,
    imageSrc: body.imageSrc,
    imageAlt: body.imageAlt,
    isActive: body.isActive,
  }))
  .pipe(UpdateServiceCanonicalSchema);

const serviceResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    key: { type: 'string' },
    name: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    summary: { type: 'string' },
    imageSrc: { type: 'string' },
    imageAlt: { type: 'string' },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

function mapServiceResponse(s: {
  id: string;
  key: string;
  title: string;
  summary: string;
  imageSrc: string;
  imageAlt: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: s.id,
    key: SERVICE_KEY_MAP[s.key] ?? s.key,
    name: s.title,
    title: s.title,
    description: s.summary,
    summary: s.summary,
    imageSrc: s.imageSrc,
    imageAlt: s.imageAlt,
    isActive: s.isActive,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

async function adminServicesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/services', {
    schema: {
      tags: ['Admin'],
      summary: 'List all services (including inactive)',
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
            data: { type: 'array', items: serviceResponseSchema },
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
      const { isActive } = request.query;
      const where = isActive !== undefined ? { isActive } : {};
      const services = await prisma.service.findMany({ where, orderBy: { key: 'asc' } });
      const mapped = services.map(mapServiceResponse);
      await reply.status(200).send({
        data: mapped,
        page: 1,
        pageSize: Math.max(mapped.length, 1),
        total: mapped.length,
        totalPages: 1,
      });
    },
  });

  app.get('/api/v1/admin/services/:serviceId', {
    schema: {
      tags: ['Admin'],
      summary: 'Get service by ID',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { serviceId: { type: 'string' } } },
      response: { 200: serviceResponseSchema },
    },
    preHandler: [...adminGuard, validate({ params: ServiceIdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: { serviceId: string } }>, reply: FastifyReply) => {
      const service = await prisma.service.findUnique({ where: { id: request.params.serviceId } });
      if (!service) throw new AppError('ACCOUNT_NOT_FOUND', 'Service not found.', 404);
      await reply.status(200).send(mapServiceResponse(service));
    },
  });

  app.post('/api/v1/admin/services', {
    schema: {
      tags: ['Admin'],
      summary: 'Create a new service',
      security: [{ BearerAuth: [] }],
      body: {
        type: 'object',
        required: ['key', 'imageSrc', 'imageAlt'],
        properties: {
          key: { type: 'string', enum: SERVICE_KEY_VALUES },
          title: { type: 'string' },
          summary: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          imageSrc: { type: 'string' },
          imageAlt: { type: 'string' },
        },
      },
      response: { 201: serviceResponseSchema },
    },
    preHandler: [...adminGuard, validate({ body: CreateServiceSchema })],
    handler: async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateServiceSchema> }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.service.findUnique({ where: { key: request.body.key } });
      if (existing) {
        throw new AppError('VALIDATION_ERROR', `A service with key '${request.body.key}' already exists.`, 422);
      }
      const service = await prisma.service.create({ data: request.body });
      await reply.status(201).send(mapServiceResponse(service));
    },
  });

  app.patch('/api/v1/admin/services/:serviceId', {
    schema: {
      tags: ['Admin'],
      summary: 'Update a service',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { serviceId: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          imageSrc: { type: 'string' },
          imageAlt: { type: 'string' },
          isActive: { type: 'boolean' },
        },
      },
      response: { 200: serviceResponseSchema },
    },
    preHandler: [...adminGuard, validate({ params: ServiceIdParamSchema, body: UpdateServiceSchema })],
    handler: async (
      request: FastifyRequest<{ Params: { serviceId: string }; Body: z.infer<typeof UpdateServiceSchema> }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.service.findUnique({ where: { id: request.params.serviceId } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Service not found.', 404);
      const service = await prisma.service.update({
        where: { id: request.params.serviceId },
        data: request.body,
      });
      await reply.status(200).send(mapServiceResponse(service));
    },
  });

  app.delete('/api/v1/admin/services/:serviceId', {
    schema: {
      tags: ['Admin'],
      summary: 'Deactivate a service (soft delete — sets isActive: false)',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { serviceId: { type: 'string' } } },
      response: { 204: { type: 'null' } },
    },
    preHandler: [...adminGuard, validate({ params: ServiceIdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: { serviceId: string } }>, reply: FastifyReply) => {
      const existing = await prisma.service.findUnique({ where: { id: request.params.serviceId } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Service not found.', 404);
      await prisma.service.update({ where: { id: request.params.serviceId }, data: { isActive: false } });
      await reply.status(204).send();
    },
  });
}

export default fp(adminServicesRoutes, { name: 'admin-services-routes' });
