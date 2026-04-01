/**
 * @file auth.routes.ts
 * @description Fastify route registration for auth module. Applies validation and rate limiting.
 * @module src/modules/auth/auth.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { rateLimiter } from '@/shared/middleware/rateLimiter.js';
import { validate } from '@/shared/middleware/validate.js';

import { authController } from './auth.controller.js';
import { LoginSchema, ParentSignupSchema, SchoolSignupSchema } from './auth.schema.js';

const signupLimiter = rateLimiter({ max: 5, windowSeconds: 60, keyPrefix: 'rl:signup' });
const loginLimiter = rateLimiter({ max: 10, windowSeconds: 60, keyPrefix: 'rl:login' });

async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/auth/signup/parent', {
    schema: {
      tags: ['Auth'],
      summary: 'Sign up as a parent',
      body: {
        type: 'object',
        required: ['email', 'password', 'fullName'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          fullName: { type: 'string' },
          phoneNumber: { type: 'string' },
          emergencyPhoneNumber: { type: 'string' },
          addressLine1: { type: 'string' },
          addressLine2: { type: 'string' },
          town: { type: 'string' },
          postCode: { type: 'string' },
          childProfile: {
            type: 'object',
            nullable: true,
            properties: {
              childFullName: { type: 'string' },
              childDateOfBirth: { type: 'string' },
              childSchoolName: { type: 'string' },
              firstAidPermission: { type: 'string' },
              gender: { type: 'string' },
              medicalNotes: { type: 'string' },
            },
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: { message: { type: 'string' } },
        },
      },
    },
    preHandler: [signupLimiter, validate({ body: ParentSignupSchema })],
    handler: authController.signupParent,
  });

  app.post('/api/v1/auth/signup/school', {
    schema: {
      tags: ['Auth'],
      summary: 'Sign up as a school',
      body: {
        type: 'object',
        required: ['adminEmail', 'adminFullName', 'password', 'schoolName'],
        properties: {
          adminEmail: { type: 'string', format: 'email' },
          adminFullName: { type: 'string' },
          password: { type: 'string', minLength: 8 },
          schoolName: { type: 'string' },
          registrationNumber: { type: 'string' },
          schoolType: { type: 'string' },
          website: { type: 'string' },
          schoolLogoFileName: { type: 'string' },
          verificationDocumentFileName: { type: 'string' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: { message: { type: 'string' } },
        },
      },
    },
    preHandler: [signupLimiter, validate({ body: SchoolSignupSchema })],
    handler: authController.signupSchool,
  });

  app.post('/api/v1/auth/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Log in with email, password and role',
      body: {
        type: 'object',
        required: ['email', 'password', 'role'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
          role: { type: 'string', enum: ['parent', 'school'] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            role: { type: 'string', enum: ['parent', 'school'] },
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
    preHandler: [loginLimiter, validate({ body: LoginSchema })],
    handler: authController.login,
  });

  app.post('/api/v1/auth/logout', {
    schema: {
      tags: ['Auth'],
      summary: 'Log out (blacklists the JWT)',
      security: [{ BearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: { message: { type: 'string' } },
        },
      },
    },
    preHandler: [authMiddleware],
    handler: authController.logout,
  });
}

export default fp(authRoutes, { name: 'auth-routes' });
