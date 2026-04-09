/**
 * @file uploads.routes.ts
 * @description Public file upload endpoints for school signup documents.
 * These are called BEFORE signup — the returned fileName is then passed as
 * schoolLogoFileName / verificationDocumentFileName in POST /auth/signup/school.
 * @module src/modules/uploads/uploads.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { uploadsController } from './uploads.controller.js';

const uploadResponseSchema = {
  type: 'object',
  properties: {
    fileUrl: { type: 'string', description: 'Full public URL of the uploaded file' },
    fileName: { type: 'string', description: 'Filename to pass into the signup API' },
  },
};

async function uploadsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/uploads/school-logo', {
    schema: {
      tags: ['Auth'],
      summary: 'Upload a school logo before signup (multipart field: file) — returns fileName to pass into school signup',
      consumes: ['multipart/form-data'],
      response: { 200: uploadResponseSchema },
    },
    handler: uploadsController.uploadSchoolLogo,
  });

  app.post('/api/v1/uploads/verification-document', {
    schema: {
      tags: ['Auth'],
      summary: 'Upload a verification document before signup (multipart field: file) — returns fileName to pass into school signup',
      consumes: ['multipart/form-data'],
      response: { 200: uploadResponseSchema },
    },
    handler: uploadsController.uploadVerificationDocument,
  });
}

export default fp(uploadsRoutes, { name: 'uploads-routes' });
