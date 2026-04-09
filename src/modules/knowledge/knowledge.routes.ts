/**
 * @file knowledge.routes.ts
 * @description Fastify route registration for knowledge/CMS endpoints. Public — no auth required.
 * @module src/modules/knowledge/knowledge.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { knowledgeController } from './knowledge.controller.js';

async function knowledgeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/knowledge/case-studies', {
    schema: {
      tags: ['Knowledge'],
      summary: 'Get all case studies (public — no auth required)',
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              body: { type: 'string' },
              tag: { type: 'string' },
            },
          },
        },
      },
    },
    handler: knowledgeController.getCaseStudies,
  });

  app.get('/api/v1/knowledge/free-activities', {
    schema: {
      tags: ['Knowledge'],
      summary: 'Get all free activity groups with download URLs (public — no auth required)',
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              downloads: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    handler: knowledgeController.getFreeActivities,
  });

  app.get('/api/v1/faqs', {
    schema: {
      tags: ['Knowledge'],
      summary: 'Get all FAQ groups (public — no auth required)',
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    question: { type: 'string' },
                    answer: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: knowledgeController.getFaqGroups,
  });
}

export default fp(knowledgeRoutes, { name: 'knowledge-routes' });
