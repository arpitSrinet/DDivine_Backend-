/**
 * @file index.ts
 * @description Barrel exports for shared schemas.
 * @module src/shared/schemas
 */
export {
  PaginationQuerySchema,
  IdParamSchema,
  clampPageSize,
  buildPaginatedResponse,
} from './common.schema.js';
export type { IPaginationQuery, IIdParam } from './common.schema.js';
