/**
 * @file prisma.ts
 * @description PrismaClient singleton for database access.
 * @module src/shared/infrastructure/prisma
 */
import { PrismaClient } from '@prisma/client';

import { env } from '@/config/env.js';

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});
