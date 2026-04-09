/**
 * @file rbac.middleware.ts
 * @description Role-based access control middleware factory. Returns a preHandler that asserts the user's role.
 * @module src/shared/middleware/rbac
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '@/shared/errors/AppError.js';

type AllowedRole = 'PARENT' | 'SCHOOL' | 'ADMIN';

export function requireRole(...roles: AllowedRole[]) {
  return async function rbacHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      throw new AppError('INVALID_CREDENTIALS', 'Authentication required.', 401);
    }

    if (!roles.includes(request.user!.role)) {
      throw new AppError(
        'FORBIDDEN',
        'You do not have permission to access this resource.',
        403,
      );
    }
  };
}
