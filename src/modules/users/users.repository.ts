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
  schoolName?: string;
  schoolType?: string;
  registrationNumber?: string;
  website?: string;
  avatarUrl?: string;
}

export const usersRepository = {
  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  async findPasswordHashById(id: string): Promise<string | null> {
    const user = await prisma.user.findUnique({ where: { id }, select: { passwordHash: true } });
    return user?.passwordHash ?? null;
  },

  async updateById(id: string, data: UpdateUserData) {
    return prisma.user.update({ where: { id }, data });
  },

  async updatePasswordById(id: string, passwordHash: string): Promise<void> {
    await prisma.user.update({ where: { id }, data: { passwordHash } });
  },

  async updateAvatarUrlById(id: string, avatarUrl: string) {
    return prisma.user.update({ where: { id }, data: { avatarUrl } });
  },

  async clearAvatarUrlById(id: string) {
    return prisma.user.update({ where: { id }, data: { avatarUrl: null } });
  },

  async deleteById(id: string): Promise<void> {
    await prisma.user.delete({ where: { id } });
  },
};
