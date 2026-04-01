/**
 * @file requestId.ts
 * @description Attaches a unique request ID to every incoming request for tracing.
 * @module src/shared/middleware/requestId
 */
import crypto from 'node:crypto';

import fp from 'fastify-plugin';

export default fp(
  async (fastify) => {
    fastify.addHook('onRequest', async (request) => {
      const existing = request.headers['x-request-id'];
      if (!existing) {
        request.headers['x-request-id'] = crypto.randomUUID();
      }
    });
  },
  { name: 'request-id' },
);
