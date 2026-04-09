/**
 * @file admin-auth.service.test.ts
 * @description Unit tests for admin auth service. Mocks repository and utility dependencies.
 * @module src/modules/admin-auth/__tests__/admin-auth.service
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminAuthService } from '../admin-auth.service.js';
import { adminAuthRepository } from '../admin-auth.repository.js';
import * as hashUtils from '@/shared/utils/hash.js';
import * as tokenUtils from '@/shared/utils/token.js';

vi.mock('../admin-auth.repository.js', () => ({
  adminAuthRepository: {
    findAdminByEmail: vi.fn(),
  },
}));

vi.mock('@/shared/utils/hash.js', () => ({
  comparePassword: vi.fn(),
}));

vi.mock('@/shared/utils/token.js', () => ({
  signToken: vi.fn(),
  verifyToken: vi.fn(),
  getTokenRemainingTtl: vi.fn(),
}));

vi.mock('@/shared/infrastructure/redis.js', () => ({
  redis: { set: vi.fn() },
}));

const mockRepo = vi.mocked(adminAuthRepository);
const mockHash = vi.mocked(hashUtils);
const mockToken = vi.mocked(tokenUtils);

describe('adminAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('returns admin token payload on valid credentials', async () => {
      mockRepo.findAdminByEmail.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        passwordHash: 'hashed-pw',
        role: 'ADMIN',
        firstName: 'Ada',
        lastName: 'Lovelace',
      } as never);
      mockHash.comparePassword.mockResolvedValue(true);
      mockToken.signToken.mockReturnValue('admin-jwt-token');

      const result = await adminAuthService.login({
        email: 'admin@test.com',
        password: 'password123',
      });

      expect(result).toEqual({
        accessToken: 'admin-jwt-token',
        role: 'admin',
        user: {
          id: 'admin-1',
          email: 'admin@test.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
          role: 'admin',
        },
      });
    });

    it('throws INVALID_CREDENTIALS when admin does not exist', async () => {
      mockRepo.findAdminByEmail.mockResolvedValue(null);

      await expect(
        adminAuthService.login({
          email: 'admin@test.com',
          password: 'password123',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('throws INVALID_CREDENTIALS on wrong password', async () => {
      mockRepo.findAdminByEmail.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        passwordHash: 'hashed-pw',
        role: 'ADMIN',
        firstName: 'Ada',
        lastName: 'Lovelace',
      } as never);
      mockHash.comparePassword.mockResolvedValue(false);

      await expect(
        adminAuthService.login({
          email: 'admin@test.com',
          password: 'wrong-password',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });
  });

  describe('logout', () => {
    it('blacklists active token jti and returns success message', async () => {
      mockToken.verifyToken.mockReturnValue({
        sub: 'admin-1',
        email: 'admin@test.com',
        role: 'ADMIN',
        jti: 'jti-123',
        iat: 1,
        exp: 2,
      });
      mockToken.getTokenRemainingTtl.mockReturnValue(120);

      const result = await adminAuthService.logout('token');

      const { redis } = await import('@/shared/infrastructure/redis.js');
      const mockedRedis = vi.mocked(redis);
      expect(mockedRedis.set).toHaveBeenCalledWith('token:blacklist:jti-123', '1', 'EX', 120);
      expect(result).toEqual({ message: 'Logged out successfully.' });
    });
  });
});
