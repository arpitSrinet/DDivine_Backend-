/**
 * @file services.routes.ts
 * @description Fastify route registration for the public services catalog. No auth required.
 * @module src/modules/services/services.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { servicesController } from './services.controller.js';

async function servicesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/services', {
    schema: {
      tags: ['Services'],
      summary: 'Get all active services (public — no auth required)',
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              key: { type: 'string', enum: ['curricular', 'extraCurricular', 'holidayCamps', 'wraparound'] },
              title: { type: 'string' },
              summary: { type: 'string' },
              imageSrc: { type: 'string' },
              imageAlt: { type: 'string' },
            },
          },
        },
      },
    },
    handler: servicesController.getServices,
  });
}

export default fp(servicesRoutes, { name: 'services-routes' });
