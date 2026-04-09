/**
 * @file setup.ts
 * @description Global test setup for Vitest.
 * @module tests/setup
 */

// Keep env validation happy for unit tests that import runtime modules.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'development';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret-with-minimum-32-chars';
