/**
 * @file schools.routes.ts
 * @description Fastify route registration for schools module. SCHOOL role only.
 * @module src/modules/schools/schools.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

import { schoolsController } from './schools.controller.js';
import { UpdateSchoolSchema } from './schools.schema.js';

const schoolProfileSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    schoolName: { type: 'string' },
    phone: { type: 'string' },
    addressLine1: { type: 'string' },
    addressLine2: { type: 'string' },
    town: { type: 'string' },
    county: { type: 'string' },
    postcode: { type: 'string' },
    registrationNumber: { type: 'string' },
    schoolType: { type: 'string' },
    website: { type: 'string' },
  },
};

const schoolGuard = [authMiddleware, requireRole('SCHOOL')];

async function schoolsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/schools/me', {
    schema: {
      tags: ['Schools'],
      summary: 'Get school profile',
      security: [{ BearerAuth: [] }],
      response: { 200: schoolProfileSchema },
    },
    preHandler: schoolGuard,
    handler: schoolsController.getProfile,
  });

  app.patch('/api/v1/schools/me', {
    schema: {
      tags: ['Schools'],
      summary: 'Update school profile',
      security: [{ BearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          phone: { type: 'string' },
          addressLine1: { type: 'string' },
          addressLine2: { type: 'string' },
          town: { type: 'string' },
          county: { type: 'string' },
          postcode: { type: 'string' },
          schoolType: { type: 'string' },
          website: { type: 'string' },
        },
      },
      response: { 200: schoolProfileSchema },
    },
    preHandler: [...schoolGuard, validate({ body: UpdateSchoolSchema })],
    handler: schoolsController.updateProfile,
  });

  app.get('/api/v1/schools/me/bookings', {
    schema: {
      tags: ['Schools'],
      summary: 'Get all bookings made under this school account',
      security: [{ BearerAuth: [] }],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              serviceName: { type: 'string' },
              date: { type: 'string' },
              time: { type: 'string' },
              location: { type: 'string' },
              status: {
                type: 'string',
                enum: [
                  'pending_payment',
                  'government_payment_pending',
                  'confirmed',
                  'refunded',
                  'cancelled',
                ],
              },
              coachName: { type: 'string' },
              price: { type: 'number' },
            },
          },
        },
      },
    },
    preHandler: schoolGuard,
    handler: schoolsController.getBookings,
  });
}

export default fp(schoolsRoutes, { name: 'schools-routes' });
