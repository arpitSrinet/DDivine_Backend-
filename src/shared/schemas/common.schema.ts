/**
 * @file common.schema.ts
 * @description Shared Zod schemas for pagination, response envelopes, and common params.
 * @module src/shared/schemas/common
 */
import { z } from 'zod';

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type IPaginationQuery = z.infer<typeof PaginationQuerySchema>;

export function clampPageSize(raw: number): number {
  if (raw > 100) return 100;
  if (raw < 1) return 20;
  return raw;
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
) {
  return {
    data,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export const IdParamSchema = z.object({
  id: z.string().min(1),
});

export type IIdParam = z.infer<typeof IdParamSchema>;
