/**
 * @file children.routes.ts
 * @description Fastify route registration for children module. Parent role only.
 * @module src/modules/children/children.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

import { childrenController } from './children.controller.js';
import { ChildIdParamSchema, CreateChildSchema, UpdateChildSchema } from './children.schema.js';

const childResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    dateOfBirth: { type: 'string' },
    gender: { type: 'string' },
    yearGroup: { type: 'string' },
    avatarUrl: { type: 'string' },
    medicalConditions: { type: 'string' },
    emergencyNote: { type: 'string' },
  },
};

const parentGuard = [authMiddleware, requireRole('PARENT')];

async function childrenRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/users/me/children', {
    schema: {
      tags: ['Children'],
      summary: 'Get all children for the current parent',
      security: [{ BearerAuth: [] }],
      response: { 200: { type: 'array', items: childResponseSchema } },
    },
    preHandler: parentGuard,
    handler: childrenController.getChildren,
  });

  app.post('/api/v1/users/me/children', {
    schema: {
      tags: ['Children'],
      summary: 'Add a child profile (requires at least one emergency contact)',
      security: [{ BearerAuth: [] }],
      body: {
        type: 'object',
        required: ['firstName', 'lastName', 'dateOfBirth', 'gender', 'yearGroup', 'emergencyContacts'],
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          dateOfBirth: { type: 'string' },
          gender: { type: 'string' },
          yearGroup: { type: 'string' },
          medicalConditions: { type: 'string' },
          emergencyNote: { type: 'string' },
          emergencyContacts: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['name', 'phone', 'relationship'],
              properties: {
                name: { type: 'string' },
                phone: { type: 'string' },
                relationship: { type: 'string' },
              },
            },
          },
        },
      },
      response: { 201: childResponseSchema },
    },
    preHandler: [...parentGuard, validate({ body: CreateChildSchema })],
    handler: childrenController.createChild,
  });

  app.patch('/api/v1/users/me/children/:childId', {
    schema: {
      tags: ['Children'],
      summary: 'Update a child profile',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { childId: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          dateOfBirth: { type: 'string' },
          gender: { type: 'string' },
          yearGroup: { type: 'string' },
          medicalConditions: { type: 'string' },
          emergencyNote: { type: 'string' },
        },
      },
      response: { 200: childResponseSchema },
    },
    preHandler: [
      ...parentGuard,
      validate({ body: UpdateChildSchema, params: ChildIdParamSchema }),
    ],
    handler: childrenController.updateChild,
  });

  app.delete('/api/v1/users/me/children/:childId', {
    schema: {
      tags: ['Children'],
      summary: 'Delete a child profile',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { childId: { type: 'string' } },
      },
      response: { 204: { type: 'null' } },
    },
    preHandler: [...parentGuard, validate({ params: ChildIdParamSchema })],
    handler: childrenController.deleteChild,
  });

  app.post('/api/v1/users/me/children/:childId/avatar', {
    schema: {
      tags: ['Children'],
      summary: 'Upload child profile avatar image (multipart/form-data, field: avatar)',
      security: [{ BearerAuth: [] }],
      consumes: ['multipart/form-data'],
      params: {
        type: 'object',
        properties: { childId: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: { avatarUrl: { type: 'string' } },
        },
      },
    },
    preHandler: [...parentGuard, validate({ params: ChildIdParamSchema })],
    handler: childrenController.uploadAvatar,
  });

  app.delete('/api/v1/users/me/children/:childId/avatar', {
    schema: {
      tags: ['Children'],
      summary: 'Remove child profile avatar',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { childId: { type: 'string' } },
      },
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
      },
    },
    preHandler: [...parentGuard, validate({ params: ChildIdParamSchema })],
    handler: childrenController.removeAvatar,
  });
}

export default fp(childrenRoutes, { name: 'children-routes' });
