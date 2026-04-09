/**
 * @file schools.repository.ts
 * @description Data access layer for schools module. All Prisma queries live here.
 * @module src/modules/schools/schools.repository
 */
import { prisma } from '@/shared/infrastructure/prisma.js';

export const schoolsRepository = {
  async findSchoolById(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, role: 'SCHOOL' },
    });
  },

  async updateSchool(
    userId: string,
    data: {
      phone?: string;
      addressLine1?: string;
      addressLine2?: string;
      town?: string;
      county?: string;
      postcode?: string;
      schoolType?: string;
      website?: string;
    },
  ) {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  },

  async getSchoolBookings(userId: string) {
    return prisma.booking.findMany({
      where: { userId },
      include: {
        session: { include: { service: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },
};
