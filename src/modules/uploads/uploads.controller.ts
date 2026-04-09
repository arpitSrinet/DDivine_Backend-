/**
 * @file uploads.controller.ts
 * @description HTTP handlers for public file upload endpoints used during school signup.
 * @module src/modules/uploads/uploads.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '@/shared/errors/AppError.js';
import { saveUploadedFile } from '@/shared/utils/fileUpload.js';

export const uploadsController = {
  async uploadSchoolLogo(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const file = await request.file();
    if (!file) {
      throw new AppError(
        'VALIDATION_ERROR',
        'No file was uploaded. Send a multipart/form-data request with field name "file".',
        422,
      );
    }
    if (file.fieldname !== 'file') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Invalid file field. Use multipart/form-data field name "file".',
        422,
      );
    }
    const fileUrl = await saveUploadedFile(file, 'avatar');
    await reply.status(200).send({ fileUrl, fileName: fileUrl.split('/').pop() });
  },

  async uploadVerificationDocument(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const file = await request.file();
    if (!file) {
      throw new AppError(
        'VALIDATION_ERROR',
        'No file was uploaded. Send a multipart/form-data request with field name "file".',
        422,
      );
    }
    if (file.fieldname !== 'file') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Invalid file field. Use multipart/form-data field name "file".',
        422,
      );
    }
    const fileUrl = await saveUploadedFile(file, 'document');
    await reply.status(200).send({ fileUrl, fileName: fileUrl.split('/').pop() });
  },
};
