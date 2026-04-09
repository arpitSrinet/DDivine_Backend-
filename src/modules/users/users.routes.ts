/**
 * @file users.routes.ts
 * @description Fastify route registration for users module.
 * @module src/modules/users/users.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

import { usersController } from './users.controller.js';
import { ChangePasswordSchema, UpdateProfileSchema } from './users.schema.js';

const userProfileSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    avatarUrl: { type: 'string' },
    phone: { type: 'string' },
    addressLine1: { type: 'string' },
    addressLine2: { type: 'string' },
    town: { type: 'string' },
    county: { type: 'string' },
    postcode: { type: 'string' },
  },
};

async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/users/me', {
    schema: {
      tags: ['Users'],
      summary: 'Get current user profile',
      security: [{ BearerAuth: [] }],
      response: { 200: userProfileSchema },
    },
    preHandler: [authMiddleware],
    handler: usersController.getProfile,
  });

  app.patch('/api/v1/users/me', {
    schema: {
      tags: ['Users'],
      summary: 'Update current user profile',
      security: [{ BearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          addressLine1: { type: 'string' },
          addressLine2: { type: 'string' },
          town: { type: 'string' },
          county: { type: 'string' },
          postcode: { type: 'string' },
        },
      },
      response: { 200: userProfileSchema },
    },
    preHandler: [authMiddleware, validate({ body: UpdateProfileSchema })],
    handler: usersController.updateProfile,
  });

  app.patch('/api/v1/users/me/password', {
    schema: {
      tags: ['Users'],
      summary: 'Change account password',
      security: [{ BearerAuth: [] }],
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 },
        },
      },
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
      },
    },
    preHandler: [authMiddleware, validate({ body: ChangePasswordSchema })],
    handler: usersController.changePassword,
  });

  app.delete('/api/v1/users/me', {
    schema: {
      tags: ['Users'],
      summary: 'Permanently delete the current user account',
      security: [{ BearerAuth: [] }],
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
      },
    },
    preHandler: [authMiddleware],
    handler: usersController.deactivate,
  });

  app.post('/api/v1/users/me/avatar', {
    schema: {
      tags: ['Users'],
      summary: 'Upload a profile avatar image (multipart/form-data, field: avatar)',
      security: [{ BearerAuth: [] }],
      consumes: ['multipart/form-data'],
      response: {
        200: {
          type: 'object',
          properties: { avatarUrl: { type: 'string' } },
        },
      },
    },
    preHandler: [authMiddleware],
    handler: usersController.uploadAvatar,
  });
}

export default fp(usersRoutes, { name: 'users-routes' });
