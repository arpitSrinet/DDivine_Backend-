/**
 * @file services.repository.ts
 * @description Data access layer for the public services catalog.
 * @module src/modules/services/services.repository
 */
import { prisma } from '@/shared/infrastructure/prisma.js';

export const servicesRepository = {
  async findAllActive() {
    return prisma.service.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  },
};
