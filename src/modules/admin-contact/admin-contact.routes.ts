/**
 * @file admin-contact.routes.ts
 * @description Admin contact inquiry inbox.
 * @module src/modules/admin-contact/admin-contact.routes
 */
import type { ContactInquiryStatus } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];

const API_STATUS: Record<string, ContactInquiryStatus> = {
  unread: 'UNREAD',
  read: 'READ',
  resolved: 'RESOLVED',
};

const STATUS_TO_API: Record<ContactInquiryStatus, string> = {
  UNREAD: 'unread',
  READ: 'read',
  RESOLVED: 'resolved',
};

const InquiryIdParam = z.object({ inquiryId: z.string().min(1) });
const PatchInquirySchema = z.object({
  status: z.enum(['unread', 'read', 'resolved']),
});

function mapInquiry(i: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: ContactInquiryStatus;
  submittedAt: Date;
}) {
  return {
    id: i.id,
    name: i.name,
    email: i.email,
    phone: i.phone ?? undefined,
    message: i.message,
    submittedAt: i.submittedAt.toISOString(),
    status: STATUS_TO_API[i.status],
  };
}

async function adminContactRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/contact', {
    schema: {
      tags: ['Admin'],
      summary: 'List contact inquiries',
      security: [{ BearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['unread', 'read', 'resolved'] },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
    },
    preHandler: adminGuard,
    handler: async (
      request: FastifyRequest<{ Querystring: { status?: string; page?: number; pageSize?: number } }>,
      reply: FastifyReply,
    ) => {
      const { status, page = 1 } = request.query;
      const pageSize = Math.min(request.query.pageSize ?? 20, 100);
      const skip = (page - 1) * pageSize;
      const where = status ? { status: API_STATUS[status] } : {};
      const [rows, total] = await Promise.all([
        prisma.contactInquiry.findMany({ where, skip, take: pageSize, orderBy: { submittedAt: 'desc' } }),
        prisma.contactInquiry.count({ where }),
      ]);
      await reply.status(200).send({
        data: rows.map(mapInquiry),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });

  app.patch('/api/v1/admin/contact/:inquiryId', {
    schema: { tags: ['Admin'], summary: 'Update inquiry status', security: [{ BearerAuth: [] }] },
    preHandler: [...adminGuard, validate({ params: InquiryIdParam, body: PatchInquirySchema })],
    handler: async (
      request: FastifyRequest<{ Params: { inquiryId: string }; Body: z.infer<typeof PatchInquirySchema> }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.contactInquiry.findUnique({ where: { id: request.params.inquiryId } });
      if (!existing) throw new AppError('ACCOUNT_NOT_FOUND', 'Inquiry not found.', 404);
      const row = await prisma.contactInquiry.update({
        where: { id: request.params.inquiryId },
        data: { status: API_STATUS[request.body.status] },
      });
      await reply.status(200).send(mapInquiry(row));
    },
  });
}

export default fp(adminContactRoutes, { name: 'admin-contact-routes' });
