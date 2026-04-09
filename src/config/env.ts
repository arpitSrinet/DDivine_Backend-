/**
 * @file env.ts
 * @description Zod-validated environment configuration. Throws on startup if required vars are missing.
 * @module src/config/env
 */
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),

  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(20).default(12),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),

  // Comma-separated list of allowed origins. Trailing slashes are ignored at runtime.
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Stripe — optional at startup, required at runtime for Phase 5 endpoints
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Email / SMTP — optional at startup, required at runtime for Phase 6 email sending
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@ddivine.co.uk'),

  // File uploads — local disk storage
  UPLOADS_DIR: z.string().default('./uploads'),
  BASE_URL: z.string().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Environment validation failed:\n${formatted}`);
}

export const env = parsed.data;

export type Env = z.infer<typeof envSchema>;
