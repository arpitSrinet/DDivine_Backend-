/**
 * @file knowledge.service.ts
 * @description Knowledge business logic — maps DB records to locked API contract shapes.
 * @module src/modules/knowledge/knowledge.service
 */
import { knowledgeRepository } from './knowledge.repository.js';
import type {
  ICaseStudyResponse,
  IFaqGroupResponse,
  IFreeActivityResponse,
} from './knowledge.schema.js';

export const knowledgeService = {
  async getCaseStudies(): Promise<ICaseStudyResponse[]> {
    const records = await knowledgeRepository.getCaseStudies();
    return records.map((cs) => ({
      id: cs.id,
      title: cs.title,
      body: cs.body,
      ...(cs.tag && { tag: cs.tag }),
    }));
  },

  async getFreeActivities(): Promise<IFreeActivityResponse[]> {
    const records = await knowledgeRepository.getFreeActivities();
    return records.map((group) => ({
      id: group.id,
      title: group.title,
      description: group.description,
      downloads: group.downloads.map((d) => d.url),
    }));
  },

  async getFaqGroups(): Promise<IFaqGroupResponse[]> {
    const groups = await knowledgeRepository.getFaqGroups();
    return groups.map((g) => ({
      title: g.title,
      items: g.items.map((item) => ({
        question: item.question,
        answer: item.answer,
      })),
    }));
  },
};
