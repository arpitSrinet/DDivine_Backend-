/**
 * @file admin-auth.service.ts
 * @description Business logic for admin authentication.
 * @module src/modules/admin-auth/admin-auth.service
 */
import { AppError } from '@/shared/errors/AppError.js';
import { redis } from '@/shared/infrastructure/redis.js';
import { comparePassword } from '@/shared/utils/hash.js';
import { getTokenRemainingTtl, signToken, verifyToken } from '@/shared/utils/token.js';
import { validateEmail } from '@/shared/domain/value-objects/Email.js';

import { adminAuthRepository } from './admin-auth.repository.js';
import type { IAdminLogin, IAdminSessionResponse } from './admin-auth.schema.js';

export const adminAuthService = {
  async login(input: IAdminLogin): Promise<IAdminSessionResponse> {
    const email = validateEmail(input.email);

    const admin = await adminAuthRepository.findAdminByEmail(email);
    if (!admin) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
    }

    const isPasswordValid = await comparePassword(input.password, admin.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
    }

    const accessToken = signToken({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    });

    return {
      accessToken,
      role: 'admin',
      user: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: 'admin',
      },
    };
  },

  async logout(token: string): Promise<{ message: string }> {
    const decoded = verifyToken(token);
    const ttl = getTokenRemainingTtl(decoded);

    if (ttl > 0) {
      await redis.set(`token:blacklist:${decoded.jti}`, '1', 'EX', ttl);
    }

    return { message: 'Logged out successfully.' };
  },
};
