/**
 * @file sessions.repository.ts
 * @description Data access layer for sessions.
 * @module src/modules/sessions/sessions.repository
 */
import { prisma } from '@/shared/infrastructure/prisma.js';

interface SessionFilters {
  serviceId?: string;
  date?: string;
  location?: string;
  page: number;
  pageSize: number;
}

export const sessionsRepository = {
  async findAll(filters: SessionFilters) {
    const where: Record<string, unknown> = { isActive: true };

    if (filters.serviceId) {
      where.serviceId = filters.serviceId;
    }

    if (filters.date) {
      const start = new Date(filters.date);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(filters.date);
      end.setUTCHours(23, 59, 59, 999);
      where.date = { gte: start, lte: end };
    }

    if (filters.location) {
      where.location = { contains: filters.location, mode: 'insensitive' };
    }

    const skip = (filters.page - 1) * filters.pageSize;

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        include: { service: { select: { title: true } } },
        orderBy: { date: 'asc' },
        skip,
        take: filters.pageSize,
      }),
      prisma.session.count({ where }),
    ]);

    return { sessions, total };
  },

  async findById(sessionId: string) {
    return prisma.session.findFirst({
      where: { id: sessionId, isActive: true },
      include: { service: { select: { title: true } } },
    });
  },
};
