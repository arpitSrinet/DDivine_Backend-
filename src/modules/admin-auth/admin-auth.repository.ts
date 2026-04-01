/**
 * @file admin-auth.repository.ts
 * @description Data access layer for admin authentication.
 * @module src/modules/admin-auth/admin-auth.repository
 */
import { prisma } from '@/shared/infrastructure/prisma.js';

export const adminAuthRepository = {
  async findAdminByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email, role: 'ADMIN' },
    });
  },
};
