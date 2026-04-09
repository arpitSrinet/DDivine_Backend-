/**
 * @file users.service.test.ts
 * @description Unit tests for users service profile and password workflows.
 * @module src/modules/users/__tests__/users.service
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usersService } from '../users.service.js';
import { usersRepository } from '../users.repository.js';
import * as hashUtils from '@/shared/utils/hash.js';

vi.mock('../users.repository.js', () => ({
  usersRepository: {
    findById: vi.fn(),
    findPasswordHashById: vi.fn(),
    updateById: vi.fn(),
    updatePasswordById: vi.fn(),
    updateAvatarUrlById: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock('@/shared/utils/hash.js', () => ({
  comparePassword: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock('@/shared/utils/fileUpload.js', () => ({
  saveUploadedFile: vi.fn(),
}));

const mockUsersRepository = vi.mocked(usersRepository);
const mockHashUtils = vi.mocked(hashUtils);

describe('usersService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ACCOUNT_NOT_FOUND when profile does not exist', async () => {
    mockUsersRepository.findById.mockResolvedValue(null);

    await expect(usersService.getProfile('user-missing')).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('maps profile fields and omits null optional values', async () => {
    mockUsersRepository.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      firstName: 'John',
      lastName: 'Doe',
      avatarUrl: null,
      phone: '07000000000',
      addressLine1: '1 Street',
      addressLine2: null,
      town: 'London',
      county: null,
      postcode: 'SW1A 1AA',
    } as never);

    const result = await usersService.getProfile('user-1');

    expect(result).toEqual({
      id: 'user-1',
      email: 'user@test.com',
      firstName: 'John',
      lastName: 'Doe',
      phone: '07000000000',
      addressLine1: '1 Street',
      town: 'London',
      postcode: 'SW1A 1AA',
    });
  });

  it('throws INVALID_CREDENTIALS when current password is incorrect', async () => {
    mockUsersRepository.findPasswordHashById.mockResolvedValue('current-hash');
    mockHashUtils.comparePassword.mockResolvedValue(false);

    await expect(
      usersService.changePassword('user-1', {
        currentPassword: 'wrong',
        newPassword: 'new-password-123',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
    });

    expect(mockUsersRepository.updatePasswordById).not.toHaveBeenCalled();
  });

  it('updates password when current password is valid and new one differs', async () => {
    mockUsersRepository.findPasswordHashById.mockResolvedValue('current-hash');
    mockHashUtils.comparePassword.mockResolvedValue(true);
    mockHashUtils.hashPassword.mockResolvedValue('new-hash');

    const result = await usersService.changePassword('user-1', {
      currentPassword: 'current-password-123',
      newPassword: 'new-password-123',
    });

    expect(mockUsersRepository.updatePasswordById).toHaveBeenCalledWith('user-1', 'new-hash');
    expect(result).toEqual({ message: 'Password updated successfully.' });
  });
});
