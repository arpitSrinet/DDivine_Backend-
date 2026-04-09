/**
 * @file fileUpload.ts
 * @description Shared utility for saving multipart file uploads to local disk.
 * Returns a public-facing URL built from BASE_URL + UPLOADS_DIR.
 * Swap the body of `saveUploadedFile` to redirect to S3/Cloudinary in future.
 * @module src/shared/utils/fileUpload
 */
import { createWriteStream, mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import type { MultipartFile } from '@fastify/multipart';

import { env } from '@/config/env.js';
import { AppError } from '@/shared/errors/AppError.js';

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const DOCUMENT_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  'application/pdf',
]);

export type UploadKind = 'avatar' | 'document';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

function getAllowedMimes(kind: UploadKind): Set<string> {
  return kind === 'avatar' ? IMAGE_MIME_TYPES : DOCUMENT_MIME_TYPES;
}

function getExtensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };
  return map[mime] ?? (extname(mime).replace('image/', '.') || '.bin');
}

/**
 * Saves an incoming multipart file to disk and returns the public URL.
 * Validates MIME type against the allowed set for the given upload kind.
 */
export async function saveUploadedFile(
  file: MultipartFile,
  kind: UploadKind,
): Promise<string> {
  const allowedMimes = getAllowedMimes(kind);

  if (!allowedMimes.has(file.mimetype)) {
    const allowed = [...allowedMimes].join(', ');
    throw new AppError(
      'INVALID_FILE_TYPE',
      `File type '${file.mimetype}' is not allowed. Allowed: ${allowed}`,
      422,
    );
  }

  const uploadsDir = resolve(process.cwd(), env.UPLOADS_DIR);
  mkdirSync(uploadsDir, { recursive: true });

  const ext = getExtensionFromMime(file.mimetype);
  const filename = `${randomUUID()}${ext}`;
  const destPath = join(uploadsDir, filename);

  let bytesWritten = 0;
  const dest = createWriteStream(destPath);

  const countingStream = new (await import('node:stream')).Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytesWritten += chunk.length;
      if (bytesWritten > MAX_FILE_SIZE_BYTES) {
        cb(new AppError('FILE_TOO_LARGE', 'File exceeds the 5 MB size limit.', 413));
        return;
      }
      cb(null, chunk);
    },
  });

  await pipeline(file.file, countingStream, dest);

  const baseUrl = env.BASE_URL.replace(/\/+$/, '');
  return `${baseUrl}/uploads/${filename}`;
}
