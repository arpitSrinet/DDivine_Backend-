/**
 * @file db.helper.ts
 * @description Test database helpers for resetting and seeding test data.
 * @module tests/helpers/db
 */
import { PrismaClient } from '@prisma/client';

const testPrisma = new PrismaClient();

export async function resetTestDb(): Promise<void> {
  const tablenames = await testPrisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== '_prisma_migrations');

  for (const table of tables) {
    await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE "public"."${table}" CASCADE;`);
  }
}

export async function disconnectTestDb(): Promise<void> {
  await testPrisma.$disconnect();
}

export { testPrisma };
