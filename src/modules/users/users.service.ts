/**
 * @file users.service.ts
 * @description Business logic for user profile management.
 * @module src/modules/users/users.service
 */
import type { MultipartFile } from '@fastify/multipart';

import { AppError } from '@/shared/errors/AppError.js';
import { comparePassword, hashPassword } from '@/shared/utils/hash.js';
import { saveUploadedFile } from '@/shared/utils/fileUpload.js';

import { usersRepository } from './users.repository.js';
import type { IChangePassword, IUpdateProfile, IUserProfileResponse } from './users.schema.js';

function mapToProfileResponse(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
}): IUserProfileResponse {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    ...(user.avatarUrl && { avatarUrl: user.avatarUrl }),
    ...(user.phone && { phone: user.phone }),
    ...(user.addressLine1 && { addressLine1: user.addressLine1 }),
    ...(user.addressLine2 && { addressLine2: user.addressLine2 }),
    ...(user.town && { town: user.town }),
    ...(user.county && { county: user.county }),
    ...(user.postcode && { postcode: user.postcode }),
  };
}

export const usersService = {
  async getProfile(userId: string): Promise<IUserProfileResponse> {
    const user = await usersRepository.findById(userId);
    if (!user) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'User not found.', 404);
    }
    return mapToProfileResponse(user);
  },

  async updateProfile(userId: string, input: IUpdateProfile): Promise<IUserProfileResponse> {
    const user = await usersRepository.findById(userId);
    if (!user) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'User not found.', 404);
    }

    const updated = await usersRepository.updateById(userId, {
      ...(input.firstName && { firstName: input.firstName.trim() }),
      ...(input.lastName && { lastName: input.lastName.trim() }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.addressLine1 !== undefined && { addressLine1: input.addressLine1 }),
      ...(input.addressLine2 !== undefined && { addressLine2: input.addressLine2 }),
      ...(input.town !== undefined && { town: input.town }),
      ...(input.county !== undefined && { county: input.county }),
      ...(input.postcode !== undefined && { postcode: input.postcode }),
    });

    return mapToProfileResponse(updated);
  },

  async changePassword(userId: string, input: IChangePassword): Promise<{ message: string }> {
    const currentHash = await usersRepository.findPasswordHashById(userId);
    if (!currentHash) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'User not found.', 404);
    }

    const isMatch = await comparePassword(input.currentPassword, currentHash);
    if (!isMatch) {
      throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect.', 401);
    }

    if (input.currentPassword === input.newPassword) {
      throw new AppError('VALIDATION_ERROR', 'New password must differ from the current password.', 422);
    }

    const newHash = await hashPassword(input.newPassword);
    await usersRepository.updatePasswordById(userId, newHash);

    return { message: 'Password updated successfully.' };
  },

  async deactivate(userId: string): Promise<{ message: string }> {
    const user = await usersRepository.findById(userId);
    if (!user) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'User not found.', 404);
    }

    await usersRepository.deleteById(userId);

    return { message: 'Account deleted successfully.' };
  },

  async uploadAvatar(userId: string, file: MultipartFile): Promise<{ avatarUrl: string }> {
    const user = await usersRepository.findById(userId);
    if (!user) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'User not found.', 404);
    }

    const avatarUrl = await saveUploadedFile(file, 'avatar');
    await usersRepository.updateAvatarUrlById(userId, avatarUrl);

    return { avatarUrl };
  },
};
