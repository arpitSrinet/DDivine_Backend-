/**
 * @file contact.routes.ts
 * @description Public contact form submission (creates admin-visible inquiries).
 * @module src/modules/contact/contact.routes
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { prisma } from '@/shared/infrastructure/prisma.js';
import { validate } from '@/shared/middleware/validate.js';

const SubmitContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().min(1),
});

async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/contact', {
    schema: {
      tags: ['Contact'],
      summary: 'Submit a contact form message (public)',
      body: {
        type: 'object',
        required: ['name', 'email', 'message'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          message: { type: 'string' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    preHandler: [validate({ body: SubmitContactSchema })],
    handler: async (request: FastifyRequest<{ Body: z.infer<typeof SubmitContactSchema> }>, reply: FastifyReply) => {
      const row = await prisma.contactInquiry.create({ data: request.body });
      await reply.status(201).send({ id: row.id, message: 'Thank you — we will be in touch soon.' });
    },
  });
}

export default fp(contactRoutes, { name: 'contact-routes' });
