/**
 * @file admin-auth.routes.ts
 * @description Fastify route registration for admin auth. Separate from user auth.
 * @module src/modules/admin-auth/admin-auth.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { rateLimiter } from '@/shared/middleware/rateLimiter.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

import { adminAuthController } from './admin-auth.controller.js';
import { AdminLoginSchema } from './admin-auth.schema.js';

const adminLoginLimiter = rateLimiter({ max: 5, windowSeconds: 60, keyPrefix: 'rl:admin-login' });

async function adminAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/admin/auth/login', {
    schema: {
      tags: ['Admin Auth'],
      summary: 'Admin login — returns JWT with role: admin',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            role: { type: 'string', enum: ['admin'] },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                role: { type: 'string' },
              },
            },
          },
        },
      },
    },
    preHandler: [adminLoginLimiter, validate({ body: AdminLoginSchema })],
    handler: adminAuthController.login,
  });

  app.post('/api/v1/admin/auth/logout', {
    schema: {
      tags: ['Admin Auth'],
      summary: 'Admin logout — blacklists the JWT',
      security: [{ BearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: { message: { type: 'string' } },
        },
      },
    },
    preHandler: [authMiddleware, requireRole('ADMIN')],
    handler: adminAuthController.logout,
  });
}

export default fp(adminAuthRoutes, { name: 'admin-auth-routes' });
