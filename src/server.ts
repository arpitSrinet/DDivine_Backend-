/**
 * @file server.ts
 * @description Application entry point. Starts the Fastify server and handles graceful shutdown.
 * @module src/server
 */
import { env } from '@/config/env.js';
import { logger } from '@/shared/infrastructure/logger.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { redis } from '@/shared/infrastructure/redis.js';

import { buildApp } from './app.js';

async function start() {
  const app = await buildApp();

  // --- Graceful shutdown ---
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received, closing gracefully');

    try {
      await app.close();
      logger.info('Fastify closed');
    } catch (err) {
      logger.error({ err }, 'Error closing Fastify');
    }

    try {
      await prisma.$disconnect();
      logger.info('Prisma disconnected');
    } catch (err) {
      logger.error({ err }, 'Error disconnecting Prisma');
    }

    try {
      redis.disconnect();
      logger.info('Redis disconnected');
    } catch (err) {
      logger.error({ err }, 'Error disconnecting Redis');
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // --- Connect Redis and start listening ---
  try {
    await redis.connect();
  } catch (err) {
    logger.fatal({ err }, 'Redis connection failed — BullMQ and caching require Redis');
    process.exit(1);
  }

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }

  // Neon serverless suspends the database after ~5 minutes of inactivity, which
  // closes existing TCP connections and causes Prisma to surface a "Closed" error.
  // Pinging every 4 minutes keeps the connection alive for as long as the server runs.
  const DB_KEEPALIVE_MS = 4 * 60 * 1000;
  setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      logger.debug('DB keepalive ping OK');
    } catch (err) {
      logger.warn({ err }, 'DB keepalive ping failed — connection will be re-established on next query');
    }
  }, DB_KEEPALIVE_MS);
}

void start();
