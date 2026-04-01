/**
 * @file sessions.schema.ts
 * @description Zod schemas for session endpoints.
 *
 * Endpoints:
 *   GET /api/v1/sessions              → query: SessionFilterSchema → response: SessionResponse[]
 *   GET /api/v1/sessions/:sessionId   → response: SessionResponse
 *
 * @module src/modules/sessions/sessions.schema
 */
import { z } from 'zod';

export const SessionFilterSchema = z.object({
  serviceId: z.string().optional(),
  date: z.string().date().optional(),
  location: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const SessionIdParamSchema = z.object({
  sessionId: z.string().min(1),
});

export const SessionResponseSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  serviceName: z.string(),
  date: z.string(),
  time: z.string(),
  location: z.string(),
  coachName: z.string().optional(),
  maxCapacity: z.number().int(),
  availableSpots: z.number().int(),
  minAgeYears: z.number().int(),
  maxAgeYears: z.number().int(),
  price: z.number().nonnegative(),
});

export type ISessionFilter = z.infer<typeof SessionFilterSchema>;
export type ISessionIdParam = z.infer<typeof SessionIdParamSchema>;
export type ISessionResponse = z.infer<typeof SessionResponseSchema>;
