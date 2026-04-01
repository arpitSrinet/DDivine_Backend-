/**
 * @file auth.domain.ts
 * @description Pure domain logic for authentication. No Prisma, no side effects.
 * @module src/modules/auth/auth.domain
 */
import type { UserRole } from '@prisma/client';

const ROLE_API_TO_DB: Record<string, UserRole> = {
  parent: 'PARENT',
  school: 'SCHOOL',
  admin: 'ADMIN',
};

const ROLE_DB_TO_API: Record<UserRole, string> = {
  PARENT: 'parent',
  SCHOOL: 'school',
  ADMIN: 'admin',
};

export function apiRoleToDbRole(apiRole: string): UserRole {
  const dbRole = ROLE_API_TO_DB[apiRole];
  if (!dbRole) {
    throw new Error(`Invalid API role: ${apiRole}`);
  }
  return dbRole;
}

export function dbRoleToApiRole(dbRole: UserRole): 'parent' | 'school' {
  return ROLE_DB_TO_API[dbRole] as 'parent' | 'school';
}
