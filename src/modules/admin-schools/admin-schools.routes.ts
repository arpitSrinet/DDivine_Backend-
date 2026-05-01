/**
 * @file admin-schools.routes.ts
 * @description Admin school approval workflows and school group-email actions.
 */
import type { SchoolApprovalStatus } from '@prisma/client';
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

const STATUS_TO_DB: Record<string, SchoolApprovalStatus> = {
  pending: 'PENDING',
  approved: 'APPROVED',
  rejected: 'REJECTED',
};

const STATUS_TO_API: Record<SchoolApprovalStatus, 'pending' | 'approved' | 'rejected'> = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const SchoolIdParamSchema = z.object({
  schoolId: z.string().min(1),
});

const ListSchoolsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const ApproveSchoolBodySchema = z.object({
  note: z.string().trim().max(500).optional(),
});

const RejectSchoolBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

const GroupEmailBodySchema = z.object({
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(20000),
  status: z.enum(['all', 'pending', 'approved', 'rejected']).optional().default('approved'),
});

const GroupEmailLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

function mapSchool(s: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  schoolName: string | null;
  isSchoolApproved: boolean;
  schoolApprovalStatus: SchoolApprovalStatus;
  schoolApprovedAt: Date | null;
  schoolRejectedAt: Date | null;
  schoolLastReviewedAt: Date | null;
  schoolReviewedByAdminId: string | null;
  schoolApprovalReason: string | null;
  createdAt: Date;
}) {
  return {
    id: s.id,
    email: s.email,
    firstName: s.firstName,
    lastName: s.lastName,
    schoolName: s.schoolName ?? '',
    isSchoolApproved: s.isSchoolApproved,
    approvalStatus: STATUS_TO_API[s.schoolApprovalStatus],
    approvedAt: s.schoolApprovedAt?.toISOString() ?? null,
    rejectedAt: s.schoolRejectedAt?.toISOString() ?? null,
    lastReviewedAt: s.schoolLastReviewedAt?.toISOString() ?? null,
    reviewedByAdminId: s.schoolReviewedByAdminId,
    reason: s.schoolApprovalReason,
    createdAt: s.createdAt.toISOString(),
  };
}

function getTransporter() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}

async function adminSchoolsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/schools', {
    schema: {
      tags: ['Admin'],
      summary: 'List school accounts and approval statuses',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...adminGuard, validate({ query: ListSchoolsQuerySchema })],
    handler: async (
      request: FastifyRequest<{ Querystring: z.infer<typeof ListSchoolsQuerySchema> }>,
      reply: FastifyReply,
    ) => {
      const { status, page, pageSize } = request.query;
      const skip = (page - 1) * pageSize;
      const where = {
        role: 'SCHOOL' as const,
        ...(status ? { schoolApprovalStatus: STATUS_TO_DB[status] } : {}),
      };

      const [rows, total] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            schoolName: true,
            isSchoolApproved: true,
            schoolApprovalStatus: true,
            schoolApprovedAt: true,
            schoolRejectedAt: true,
            schoolLastReviewedAt: true,
            schoolReviewedByAdminId: true,
            schoolApprovalReason: true,
            createdAt: true,
          },
        }),
        prisma.user.count({ where }),
      ]);

      await reply.status(200).send({
        data: rows.map(mapSchool),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });

  app.get('/api/v1/admin/schools/:schoolId/approval-status', {
    schema: {
      tags: ['Admin'],
      summary: 'Get approval status for a school account',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...adminGuard, validate({ params: SchoolIdParamSchema })],
    handler: async (
      request: FastifyRequest<{ Params: z.infer<typeof SchoolIdParamSchema> }>,
      reply: FastifyReply,
    ) => {
      const school = await prisma.user.findFirst({
        where: { id: request.params.schoolId, role: 'SCHOOL' },
        select: {
          id: true,
          isSchoolApproved: true,
          schoolApprovalStatus: true,
          schoolLastReviewedAt: true,
          schoolReviewedByAdminId: true,
          schoolApprovalReason: true,
        },
      });

      if (!school) throw new AppError('ACCOUNT_NOT_FOUND', 'School not found.', 404);

      await reply.status(200).send({
        data: {
          schoolId: school.id,
          isSchoolApproved: school.isSchoolApproved,
          approvalStatus: STATUS_TO_API[school.schoolApprovalStatus],
          lastReviewedAt: school.schoolLastReviewedAt?.toISOString() ?? null,
          reviewedByAdminId: school.schoolReviewedByAdminId,
          reason: school.schoolApprovalReason,
        },
      });
    },
  });

  app.patch('/api/v1/admin/schools/:schoolId/approve', {
    schema: {
      tags: ['Admin'],
      summary: 'Approve school account',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...adminGuard, validate({ params: SchoolIdParamSchema, body: ApproveSchoolBodySchema })],
    handler: async (
      request: FastifyRequest<{ Params: z.infer<typeof SchoolIdParamSchema>; Body: z.infer<typeof ApproveSchoolBodySchema> }>,
      reply: FastifyReply,
    ) => {
      const school = await prisma.user.findFirst({
        where: { id: request.params.schoolId, role: 'SCHOOL' },
        select: { id: true },
      });

      if (!school) throw new AppError('ACCOUNT_NOT_FOUND', 'School not found.', 404);

      const now = new Date();
      const updated = await prisma.user.update({
        where: { id: school.id },
        data: {
          isSchoolApproved: true,
          schoolApprovalStatus: 'APPROVED',
          schoolApprovedAt: now,
          schoolRejectedAt: null,
          schoolLastReviewedAt: now,
          schoolReviewedByAdminId: request.user!.id,
          schoolApprovalReason: request.body.note ?? null,
        },
        select: {
          id: true,
          isSchoolApproved: true,
          schoolApprovedAt: true,
          schoolReviewedByAdminId: true,
          schoolApprovalReason: true,
        },
      });

      await reply.status(200).send({
        data: {
          schoolId: updated.id,
          isSchoolApproved: updated.isSchoolApproved,
          approvalStatus: 'approved',
          approvedAt: updated.schoolApprovedAt?.toISOString() ?? now.toISOString(),
          approvedByAdminId: updated.schoolReviewedByAdminId ?? request.user!.id,
          note: updated.schoolApprovalReason,
        },
      });
    },
  });

  app.patch('/api/v1/admin/schools/:schoolId/reject', {
    schema: {
      tags: ['Admin'],
      summary: 'Reject school account',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...adminGuard, validate({ params: SchoolIdParamSchema, body: RejectSchoolBodySchema })],
    handler: async (
      request: FastifyRequest<{ Params: z.infer<typeof SchoolIdParamSchema>; Body: z.infer<typeof RejectSchoolBodySchema> }>,
      reply: FastifyReply,
    ) => {
      const school = await prisma.user.findFirst({
        where: { id: request.params.schoolId, role: 'SCHOOL' },
        select: { id: true },
      });
      if (!school) throw new AppError('ACCOUNT_NOT_FOUND', 'School not found.', 404);

      const now = new Date();
      const updated = await prisma.user.update({
        where: { id: school.id },
        data: {
          isSchoolApproved: false,
          schoolApprovalStatus: 'REJECTED',
          schoolApprovedAt: null,
          schoolRejectedAt: now,
          schoolLastReviewedAt: now,
          schoolReviewedByAdminId: request.user!.id,
          schoolApprovalReason: request.body.reason,
        },
        select: {
          id: true,
          isSchoolApproved: true,
          schoolRejectedAt: true,
          schoolReviewedByAdminId: true,
          schoolApprovalReason: true,
        },
      });

      await reply.status(200).send({
        data: {
          schoolId: updated.id,
          isSchoolApproved: updated.isSchoolApproved,
          approvalStatus: 'rejected',
          rejectedAt: updated.schoolRejectedAt?.toISOString() ?? now.toISOString(),
          rejectedByAdminId: updated.schoolReviewedByAdminId ?? request.user!.id,
          reason: updated.schoolApprovalReason ?? request.body.reason,
        },
      });
    },
  });

  app.post('/api/v1/admin/schools/group-email', {
    schema: {
      tags: ['Admin'],
      summary: 'Send group email to schools by status filter',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...adminGuard, validate({ body: GroupEmailBodySchema })],
    handler: async (
      request: FastifyRequest<{ Body: z.infer<typeof GroupEmailBodySchema> }>,
      reply: FastifyReply,
    ) => {
      if (!env.SMTP_HOST) {
        throw new AppError('EMAIL_NOT_CONFIGURED', 'Email service is not configured.', 500);
      }

      const { subject, message, status } = request.body;
      const schools = await prisma.user.findMany({
        where: {
          role: 'SCHOOL',
          ...(status && status !== 'all' ? { schoolApprovalStatus: STATUS_TO_DB[status] } : {}),
        },
        select: { email: true, schoolName: true },
      });

      const recipients = schools.map((s) => s.email).filter(Boolean);
      if (recipients.length === 0) {
        await prisma.schoolGroupEmailLog.create({
          data: {
            subject,
            message,
            targetStatus: status,
            recipientsCount: 0,
            sentCount: 0,
            sentByAdminId: request.user!.id,
          },
        });
        await reply.status(200).send({
          data: { recipients: 0, sent: 0 },
        });
        return;
      }

      const transporter = getTransporter();
      const batchSize = 50;
      let sent = 0;
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        await transporter.sendMail({
          from: env.EMAIL_FROM,
          to: env.EMAIL_FROM,
          bcc: batch.join(','),
          subject,
          html: `
            <div>
              <p>Hello School Partner,</p>
              <div style="white-space: pre-wrap;">${message}</div>
              <p style="margin-top: 20px;">— DDivine Admin Team</p>
            </div>
          `,
        });
        sent += batch.length;
      }

      await prisma.schoolGroupEmailLog.create({
        data: {
          subject,
          message,
          targetStatus: status,
          recipientsCount: recipients.length,
          sentCount: sent,
          sentByAdminId: request.user!.id,
        },
      });

      await reply.status(200).send({
        data: { recipients: recipients.length, sent },
      });
    },
  });

  app.get('/api/v1/admin/schools/group-email/logs', {
    schema: {
      tags: ['Admin'],
      summary: 'List school group-email logs',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...adminGuard, validate({ query: GroupEmailLogsQuerySchema })],
    handler: async (
      request: FastifyRequest<{ Querystring: z.infer<typeof GroupEmailLogsQuerySchema> }>,
      reply: FastifyReply,
    ) => {
      const { page, pageSize } = request.query;
      const skip = (page - 1) * pageSize;
      const [rows, total] = await Promise.all([
        prisma.schoolGroupEmailLog.findMany({
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.schoolGroupEmailLog.count(),
      ]);

      await reply.status(200).send({
        data: rows.map((row) => ({
          id: row.id,
          subject: row.subject,
          message: row.message,
          targetStatus: row.targetStatus,
          recipientsCount: row.recipientsCount,
          sentCount: row.sentCount,
          sentByAdminId: row.sentByAdminId,
          createdAt: row.createdAt.toISOString(),
        })),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      });
    },
  });
}

export default fp(adminSchoolsRoutes, { name: 'admin-schools-routes' });
