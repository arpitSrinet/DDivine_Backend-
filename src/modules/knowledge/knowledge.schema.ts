/**
 * @file knowledge.schema.ts
 * @description Zod schemas for knowledge/CMS endpoints. Matches locked frontend contract (Section 8.7).
 *
 * Endpoints:
 *   GET /api/v1/knowledge/case-studies     → response: CaseStudyResponse[]
 *   GET /api/v1/knowledge/free-activities  → response: FreeActivityResponse[]
 *   GET /api/v1/faqs                       → response: FaqGroupResponse[]
 *
 * @module src/modules/knowledge/knowledge.schema
 */
import { z } from 'zod';

export const CaseStudyResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  tag: z.string().optional(),
});

export const FreeActivityResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  downloads: z.array(z.string()),
});

export const FaqItemResponseSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const FaqGroupResponseSchema = z.object({
  title: z.string(),
  items: z.array(FaqItemResponseSchema),
});

export type ICaseStudyResponse = z.infer<typeof CaseStudyResponseSchema>;
export type IFreeActivityResponse = z.infer<typeof FreeActivityResponseSchema>;
export type IFaqGroupResponse = z.infer<typeof FaqGroupResponseSchema>;
