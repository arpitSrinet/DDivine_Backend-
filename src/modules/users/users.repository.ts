/**
 * @file users.repository.ts
 * @description Data access layer for user profiles.
 * @module src/modules/users/users.repository
 */
import { prisma } from '@/shared/infrastructure/prisma.js';

interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  town?: string;
  county?: string;
  postcode?: string;
}

export const usersRepository = {
  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  async updateById(id: string, data: UpdateUserData) {
    return prisma.user.update({ where: { id }, data });
  },
};
