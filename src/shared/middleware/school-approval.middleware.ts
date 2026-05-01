/**
 * @file school-approval.middleware.ts
 * @description School approval guard. Ensures SCHOOL users are approved before restricted actions.
 * @module src/shared/middleware/school-approval.middleware
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';

export async function requireApprovedSchool(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const userId = request.user?.id;
  if (!userId) {
    throw new AppError('INVALID_CREDENTIALS', 'Authentication required.', 401);
  }

  const school = await prisma.user.findFirst({
    where: { id: userId, role: 'SCHOOL' },
    select: { id: true, isSchoolApproved: true },
  });

  if (!school) {
    throw new AppError('ACCOUNT_NOT_FOUND', 'School profile not found.', 404);
  }

  if (!school.isSchoolApproved) {
    throw new AppError(
      'SCHOOL_NOT_APPROVED',
      'Your school profile is not approved yet. You cannot create games.',
      403,
    );
  }
}
