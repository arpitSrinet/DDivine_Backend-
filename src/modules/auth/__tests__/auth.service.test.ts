/**
 * @file auth.service.test.ts
 * @description Unit tests for the auth service. Mocks the repository layer.
 * @module src/modules/auth/__tests__/auth.service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { authService } from '../auth.service.js';
import { authRepository } from '../auth.repository.js';
import * as hashUtils from '@/shared/utils/hash.js';
import * as tokenUtils from '@/shared/utils/token.js';

vi.mock('../auth.repository.js', () => ({
  authRepository: {
    findUserByEmail: vi.fn(),
    findUserByEmailAndRole: vi.fn(),
    createUser: vi.fn(),
    createParentWithChild: vi.fn(),
  },
}));

vi.mock('@/shared/utils/hash.js', () => ({
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
}));

vi.mock('@/shared/utils/token.js', () => ({
  signToken: vi.fn(),
  verifyToken: vi.fn(),
  getTokenRemainingTtl: vi.fn(),
}));

vi.mock('@/shared/infrastructure/redis.js', () => ({
  redis: { set: vi.fn(), get: vi.fn() },
}));

vi.mock('@/shared/events/event-bus.js', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('@/shared/infrastructure/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockRepo = vi.mocked(authRepository);
const mockHash = vi.mocked(hashUtils);
const mockToken = vi.mocked(tokenUtils);

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signupParent', () => {
    const validInput = {
      email: 'parent@test.com',
      password: 'password123',
      fullName: 'John Doe',
    };

    it('creates a parent account and returns a message', async () => {
      mockRepo.findUserByEmail.mockResolvedValue(null);
      mockHash.hashPassword.mockResolvedValue('hashed-pw');
      (mockRepo as unknown as { createParentWithChild: ReturnType<typeof vi.fn> }).createParentWithChild.mockResolvedValue({
        id: 'user-1',
        email: 'parent@test.com',
        passwordHash: 'hashed-pw',
        role: 'PARENT',
        firstName: 'John',
        lastName: 'Doe',
        schoolName: null,
        phone: null,
        emergencyPhone: null,
        addressLine1: null,
        addressLine2: null,
        town: null,
        county: null,
        postcode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await authService.signupParent(validInput);

      expect(result).toEqual({ message: 'Account created successfully.' });
    });

    it('throws EMAIL_ALREADY_EXISTS if email is taken', async () => {
      mockRepo.findUserByEmail.mockResolvedValue({
        id: 'existing',
        email: 'parent@test.com',
        passwordHash: 'x',
        role: 'PARENT',
        firstName: 'X',
        lastName: 'Y',
        schoolName: null,
        phone: null,
        emergencyPhone: null,
        addressLine1: null,
        addressLine2: null,
        town: null,
        county: null,
        postcode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(authService.signupParent(validInput)).rejects.toThrow('EMAIL_ALREADY_EXISTS');
    });
  });

  describe('signupSchool', () => {
    const validInput = {
      adminEmail: 'school@test.com',
      adminFullName: 'Jane Smith',
      password: 'password123',
      schoolName: 'Test Academy',
    };

    it('creates a school account with schoolName mapped correctly', async () => {
      mockRepo.findUserByEmail.mockResolvedValue(null);
      mockHash.hashPassword.mockResolvedValue('hashed-pw');
      mockRepo.createUser.mockResolvedValue({
        id: 'user-2',
        email: 'school@test.com',
        passwordHash: 'hashed-pw',
        role: 'SCHOOL',
        firstName: 'Jane',
        lastName: 'Smith',
        schoolName: 'Test Academy',
        phone: null,
        emergencyPhone: null,
        addressLine1: null,
        addressLine2: null,
        town: null,
        county: null,
        postcode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await authService.signupSchool(validInput);

      expect(result).toEqual({ message: 'Account created successfully.' });
      expect(mockRepo.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'SCHOOL',
          firstName: 'Jane',
          lastName: 'Smith',
          schoolName: 'Test Academy',
        }),
      );
    });
  });

  describe('login', () => {
    it('returns accessToken and user on valid credentials', async () => {
      mockRepo.findUserByEmailAndRole.mockResolvedValue({
        id: 'user-1',
        email: 'parent@test.com',
        passwordHash: 'hashed-pw',
        role: 'PARENT',
        firstName: 'John',
        lastName: 'Doe',
        schoolName: null,
        phone: null,
        emergencyPhone: null,
        addressLine1: null,
        addressLine2: null,
        town: null,
        county: null,
        postcode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockHash.comparePassword.mockResolvedValue(true);
      mockToken.signToken.mockReturnValue('jwt-token-123');

      const result = await authService.login({
        email: 'parent@test.com',
        password: 'password123',
        role: 'parent',
      });

      expect(result).toEqual({
        accessToken: 'jwt-token-123',
        role: 'parent',
        user: {
          id: 'user-1',
          email: 'parent@test.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'parent',
        },
      });
    });

    it('throws INVALID_CREDENTIALS on wrong password', async () => {
      mockRepo.findUserByEmailAndRole.mockResolvedValue({
        id: 'user-1',
        email: 'parent@test.com',
        passwordHash: 'hashed-pw',
        role: 'PARENT',
        firstName: 'John',
        lastName: 'Doe',
        schoolName: null,
        phone: null,
        emergencyPhone: null,
        addressLine1: null,
        addressLine2: null,
        town: null,
        county: null,
        postcode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockHash.comparePassword.mockResolvedValue(false);

      await expect(
        authService.login({ email: 'parent@test.com', password: 'wrong', role: 'parent' }),
      ).rejects.toThrow('INVALID_CREDENTIALS');
    });

    it('throws INVALID_CREDENTIALS on wrong role', async () => {
      mockRepo.findUserByEmailAndRole.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'parent@test.com', password: 'pass', role: 'school' }),
      ).rejects.toThrow('INVALID_CREDENTIALS');
    });
  });
});
