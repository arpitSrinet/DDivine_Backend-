/**
 * @file transaction.ts
 * @description Prisma interactive transaction helper with automatic retry on serialization failures.
 * @module src/shared/utils/transaction
 */
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import { logger } from '@/shared/infrastructure/logger.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

type TransactionFn<T> = (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>;

export async function withTransaction<T>(
  prisma: PrismaClient,
  fn: TransactionFn<T>,
  retries: number = MAX_RETRIES,
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: 'Serializable',
        timeout: 10000,
      });
    } catch (error) {
      const isSerializationFailure =
        error instanceof Error && error.message.includes('could not serialize');
      const isWriteConflictOrDeadlock =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034';

      if ((isSerializationFailure || isWriteConflictOrDeadlock) && attempt < retries) {
        logger.warn(
          { attempt, maxRetries: retries },
          'Transaction serialization conflict, retrying',
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        continue;
      }

      throw error;
    }
  }

  throw new Error('Transaction failed after max retries');
}
