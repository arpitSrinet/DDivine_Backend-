/**
 * @file services.schema.ts
 * @description Zod schemas for public services catalog. Matches locked frontend contract (Section 8.5).
 *
 * Endpoints:
 *   GET /api/v1/services → response: ServiceResponse[] (no auth required)
 *
 * ServiceKey enum map (Prisma → API):
 *   CURRICULAR      → 'curricular'
 *   EXTRA_CURRICULAR → 'extraCurricular'
 *   HOLIDAY_CAMPS   → 'holidayCamps'
 *   WRAPAROUND      → 'wraparound'
 *
 * @module src/modules/services/services.schema
 */
import { z } from 'zod';
import type { ServiceKey } from '@prisma/client';

export const SERVICE_KEY_MAP: Record<ServiceKey, string> = {
  CURRICULAR: 'curricular',
  EXTRA_CURRICULAR: 'extraCurricular',
  HOLIDAY_CAMPS: 'holidayCamps',
  WRAPAROUND: 'wraparound',
};

export const ServiceResponseSchema = z.object({
  id: z.string(),
  key: z.enum(['curricular', 'extraCurricular', 'holidayCamps', 'wraparound']),
  title: z.string(),
  summary: z.string(),
  imageSrc: z.string(),
  imageAlt: z.string(),
});

export type IServiceResponse = z.infer<typeof ServiceResponseSchema>;
