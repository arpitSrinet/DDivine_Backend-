/**
 * @file hash.ts
 * @description bcryptjs hash and compare utilities for password management.
 * @module src/shared/utils/hash
 */
import bcrypt from 'bcryptjs';

import { env } from '@/config/env.js';

export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, env.BCRYPT_ROUNDS);
}

export async function comparePassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}
