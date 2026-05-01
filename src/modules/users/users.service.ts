/**
 * @file users.service.ts
 * @description Business logic for user profile management.
 * @module src/modules/users/users.service
 */
import type { MultipartFile } from '@fastify/multipart';

import { AppError } from '@/shared/errors/AppError.js';
import { comparePassword, hashPassword } from '@/shared/utils/hash.js';
import { deleteUploadedFile, saveUploadedFile } from '@/shared/utils/fileUpload.js';

import { usersRepository } from './users.repository.js';
import type { IChangePassword, IUpdateProfile, IUserProfileResponse } from './users.schema.js';

function mapToProfileResponse(user: {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
  schoolName: string | null;
  schoolType: string | null;
  registrationNumber: string | null;
  website: string | null;
  isSchoolApproved: boolean;
  schoolApprovalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}): IUserProfileResponse {
  const isSchoolUser = user.role === 'SCHOOL';
  const adminFullName = `${user.firstName} ${user.lastName}`.trim();

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
    ...(isSchoolUser && user.schoolName && { schoolName: user.schoolName }),
    ...(isSchoolUser && user.schoolType && { schoolType: user.schoolType }),
    ...(isSchoolUser &&
      user.registrationNumber && {
        registrationNumber: user.registrationNumber,
      }),
    ...(isSchoolUser && user.website && { website: user.website }),
    ...(isSchoolUser && { adminFullName }),
    ...(isSchoolUser && { isSchoolApproved: user.isSchoolApproved }),
    ...(isSchoolUser && { schoolApprovalStatus: user.schoolApprovalStatus.toLowerCase() as 'pending' | 'approved' | 'rejected' }),
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

    let firstName = input.firstName?.trim();
    let lastName = input.lastName?.trim();

    if (user.role === 'SCHOOL' && input.adminFullName !== undefined) {
      const trimmedAdminName = input.adminFullName.trim();
      const [adminFirstName, ...rest] = trimmedAdminName.split(/\s+/);
      firstName = adminFirstName;
      lastName = rest.join(' ');
    }

    const updated = await usersRepository.updateById(userId, {
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.addressLine1 !== undefined && { addressLine1: input.addressLine1 }),
      ...(input.addressLine2 !== undefined && { addressLine2: input.addressLine2 }),
      ...(input.town !== undefined && { town: input.town }),
      ...(input.county !== undefined && { county: input.county }),
      ...(input.postcode !== undefined && { postcode: input.postcode }),
      ...(user.role === 'SCHOOL' &&
        input.schoolName !== undefined && { schoolName: input.schoolName.trim() }),
      ...(user.role === 'SCHOOL' &&
        input.schoolType !== undefined && { schoolType: input.schoolType.trim() }),
      ...(user.role === 'SCHOOL' &&
        input.registrationNumber !== undefined && {
          registrationNumber: input.registrationNumber.trim(),
        }),
      ...(user.role === 'SCHOOL' &&
        input.website !== undefined && { website: input.website.trim() }),
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

  async removeAvatar(userId: string): Promise<{ message: string }> {
    const user = await usersRepository.findById(userId);
    if (!user) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'User not found.', 404);
    }
    if (!user.avatarUrl) {
      throw new AppError('NOT_FOUND', 'No avatar to remove.', 404);
    }

    await deleteUploadedFile(user.avatarUrl);
    await usersRepository.clearAvatarUrlById(userId);

    return { message: 'Avatar removed successfully.' };
  },
};
