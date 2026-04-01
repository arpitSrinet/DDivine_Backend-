/**
 * @file token.ts
 * @description JWT sign and verify utilities. Every token includes a unique jti for blacklist support.
 * @module src/shared/utils/token
 */
import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

import { env } from '@/config/env.js';

interface TokenPayload {
  sub: string;
  email: string;
  role: string;
}

interface DecodedToken extends TokenPayload {
  jti: string;
  iat: number;
  exp: number;
}

export function signToken(payload: TokenPayload): string {
  const jti = crypto.randomUUID();
  return jwt.sign({ ...payload, jti }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

export function verifyToken(token: string): DecodedToken {
  return jwt.verify(token, env.JWT_SECRET) as DecodedToken;
}

export function getTokenRemainingTtl(decoded: DecodedToken): number {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.max(0, decoded.exp - nowSeconds);
}
