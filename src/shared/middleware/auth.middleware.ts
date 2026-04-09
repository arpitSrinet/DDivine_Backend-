/**
 * @file auth.middleware.ts
 * @description JWT verification middleware. Extracts Bearer token, verifies it, checks blacklist, attaches user to request.
 * @module src/shared/middleware/auth
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '@/shared/errors/AppError.js';
import { redis } from '@/shared/infrastructure/redis.js';
import { verifyToken } from '@/shared/utils/token.js';

export interface IAuthUser {
  id: string;
  email: string;
  role: 'PARENT' | 'SCHOOL' | 'ADMIN';
  jti: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: IAuthUser;
  }
}

/**
 * Shared token verification logic. Resolves the decoded user or throws an AppError.
 */
async function resolveTokenToUser(token: string): Promise<IAuthUser> {
  let payload: IAuthUser;
  try {
    const decoded = verifyToken(token);
    payload = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role as 'PARENT' | 'SCHOOL' | 'ADMIN',
      jti: decoded.jti,
    };
  } catch {
    throw new AppError('TOKEN_EXPIRED', 'Token is invalid or has expired.', 401);
  }

  const isBlacklisted = await redis.get(`token:blacklist:${payload.jti}`);
  if (isBlacklisted) {
    throw new AppError('TOKEN_EXPIRED', 'Token has been revoked.', 401);
  }

  return payload;
}

/**
 * Hard auth guard — rejects the request with 401 if no valid Bearer token is present.
 * Use on all routes that require authentication.
 */
export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('INVALID_CREDENTIALS', 'Missing or invalid authorization header.', 401);
  }

  request.user = await resolveTokenToUser(authHeader.slice(7));
}

/**
 * Optional auth middleware — attaches `request.user` when a valid Bearer token is present,
 * but allows the request through unauthenticated when no Authorization header is sent.
 * Use on public routes where auth enriches the response but is not required (e.g. sessions list).
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return;
  }

  request.user = await resolveTokenToUser(authHeader.slice(7));
}
