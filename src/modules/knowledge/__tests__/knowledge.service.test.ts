/**
 * @file knowledge.service.test.ts
 * @description Unit tests for knowledge service response mapping.
 * @module src/modules/knowledge/__tests__/knowledge.service
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { knowledgeService } from '../knowledge.service.js';
import { knowledgeRepository } from '../knowledge.repository.js';

vi.mock('../knowledge.repository.js', () => ({
  knowledgeRepository: {
    getCaseStudies: vi.fn(),
    getFreeActivities: vi.fn(),
    getFaqGroups: vi.fn(),
  },
}));

const mockKnowledgeRepository = vi.mocked(knowledgeRepository);

describe('knowledgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps case studies and omits empty tag values', async () => {
    mockKnowledgeRepository.getCaseStudies.mockResolvedValue([
      { id: 'cs-1', title: 'A', body: 'Body A', tag: 'football' },
      { id: 'cs-2', title: 'B', body: 'Body B', tag: null },
    ] as never);

    const result = await knowledgeService.getCaseStudies();

    expect(result).toEqual([
      { id: 'cs-1', title: 'A', body: 'Body A', tag: 'football' },
      { id: 'cs-2', title: 'B', body: 'Body B' },
    ]);
  });

  it('maps free activity downloads to URL string array', async () => {
    mockKnowledgeRepository.getFreeActivities.mockResolvedValue([
      {
        id: 'fa-1',
        title: 'Downloads',
        description: 'Worksheets',
        downloads: [{ url: 'https://cdn.example.com/a.pdf' }, { url: 'https://cdn.example.com/b.pdf' }],
      },
    ] as never);

    const result = await knowledgeService.getFreeActivities();

    expect(result).toEqual([
      {
        id: 'fa-1',
        title: 'Downloads',
        description: 'Worksheets',
        downloads: ['https://cdn.example.com/a.pdf', 'https://cdn.example.com/b.pdf'],
      },
    ]);
  });

  it('maps faq groups to locked contract shape', async () => {
    mockKnowledgeRepository.getFaqGroups.mockResolvedValue([
      {
        title: 'General',
        items: [
          { question: 'Q1', answer: 'A1' },
          { question: 'Q2', answer: 'A2' },
        ],
      },
    ] as never);

    const result = await knowledgeService.getFaqGroups();

    expect(result).toEqual([
      {
        title: 'General',
        items: [
          { question: 'Q1', answer: 'A1' },
          { question: 'Q2', answer: 'A2' },
        ],
      },
    ]);
  });
});
