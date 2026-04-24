/**
 * @file children.service.ts
 * @description Business logic for children management. Enforces domain invariants.
 * @module src/modules/children/children.service
 */
import type { MultipartFile } from '@fastify/multipart';

import { AppError } from '@/shared/errors/AppError.js';
import { assertEmergencyContactExists } from '@/shared/domain/invariants/assertEmergencyContactExists.js';
import { validateDateOfBirth } from '@/shared/domain/value-objects/DateOfBirth.js';
import { deleteUploadedFile, saveUploadedFile } from '@/shared/utils/fileUpload.js';

import { mapToChildResponse } from './children.domain.js';
import { childrenRepository } from './children.repository.js';
import type { IChildResponse, ICreateChild, IUpdateChild } from './children.schema.js';

export const childrenService = {
  async getChildren(userId: string): Promise<IChildResponse[]> {
    const children = await childrenRepository.findAllByUserId(userId);
    return children.map(mapToChildResponse);
  },

  async createChild(userId: string, input: ICreateChild): Promise<IChildResponse> {
    assertEmergencyContactExists(input.emergencyContacts);
    const dateOfBirth = validateDateOfBirth(input.dateOfBirth);

    const child = await childrenRepository.create({
      userId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      dateOfBirth,
      gender: input.gender,
      yearGroup: input.yearGroup,
      medicalConditions: input.medicalConditions,
      emergencyNote: input.emergencyNote,
      emergencyContacts: input.emergencyContacts,
    });

    return mapToChildResponse(child);
  },

  async updateChild(
    userId: string,
    childId: string,
    input: IUpdateChild,
  ): Promise<IChildResponse> {
    const existing = await childrenRepository.findByIdAndUserId(childId, userId);
    if (!existing) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'Child not found.', 404);
    }

    const dateOfBirth = input.dateOfBirth
      ? validateDateOfBirth(input.dateOfBirth)
      : undefined;

    const updated = await childrenRepository.updateById(childId, {
      ...(input.firstName && { firstName: input.firstName.trim() }),
      ...(input.lastName && { lastName: input.lastName.trim() }),
      ...(dateOfBirth && { dateOfBirth }),
      ...(input.gender && { gender: input.gender }),
      ...(input.yearGroup && { yearGroup: input.yearGroup }),
      ...(input.medicalConditions !== undefined && { medicalConditions: input.medicalConditions }),
      ...(input.emergencyNote !== undefined && { emergencyNote: input.emergencyNote }),
    });

    return mapToChildResponse(updated);
  },

  async deleteChild(userId: string, childId: string): Promise<void> {
    const existing = await childrenRepository.findByIdAndUserId(childId, userId);
    if (!existing) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'Child not found.', 404);
    }
    await childrenRepository.softDeleteById(childId);
  },

  async uploadAvatar(
    userId: string,
    childId: string,
    file: MultipartFile,
  ): Promise<{ avatarUrl: string }> {
    const existing = await childrenRepository.findByIdAndUserId(childId, userId);
    if (!existing) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'Child not found.', 404);
    }

    const avatarUrl = await saveUploadedFile(file, 'avatar');
    await childrenRepository.updateAvatarUrlById(childId, avatarUrl);

    return { avatarUrl };
  },

  async removeAvatar(userId: string, childId: string): Promise<{ message: string }> {
    const existing = await childrenRepository.findByIdAndUserId(childId, userId);
    if (!existing) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'Child not found.', 404);
    }
    if (!existing.avatarUrl) {
      throw new AppError('NOT_FOUND', 'No avatar to remove.', 404);
    }

    await deleteUploadedFile(existing.avatarUrl);
    await childrenRepository.clearAvatarUrlById(childId);

    return { message: 'Avatar removed successfully.' };
  },
};
