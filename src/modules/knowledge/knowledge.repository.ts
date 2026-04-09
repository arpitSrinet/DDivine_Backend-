/**
 * @file knowledge.repository.ts
 * @description Data access layer for knowledge/CMS content. All Prisma queries live here.
 * @module src/modules/knowledge/knowledge.repository
 */
import { prisma } from '@/shared/infrastructure/prisma.js';

export const knowledgeRepository = {
  async getCaseStudies() {
    return prisma.caseStudy.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
  },

  async getFreeActivities() {
    return prisma.freeActivityGroup.findMany({
      where: { isActive: true },
      include: { downloads: true },
      orderBy: { order: 'asc' },
    });
  },

  async getFaqGroups() {
    return prisma.faqGroup.findMany({
      where: { isActive: true },
      include: {
        items: { orderBy: { order: 'asc' } },
      },
      orderBy: { order: 'asc' },
    });
  },
};
