/**
 * @file logger.ts
 * @description Pino logger singleton with structured JSON output.
 * @module src/shared/infrastructure/logger
 */
import pino from 'pino';

import { env } from '@/config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'password', 'passwordHash', 'accessToken'],
    censor: '[REDACTED]',
  },
});

export type Logger = typeof logger;
