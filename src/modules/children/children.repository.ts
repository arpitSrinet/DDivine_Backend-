/**
 * @file children.repository.ts
 * @description Data access layer for children and emergency contacts.
 * @module src/modules/children/children.repository
 */
import { prisma } from '@/shared/infrastructure/prisma.js';
import type { IEmergencyContact } from './children.schema.js';

interface CreateChildData {
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: string;
  yearGroup: string;
  medicalConditions?: string;
  emergencyNote?: string;
  emergencyContacts: IEmergencyContact[];
}

interface UpdateChildData {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  gender?: string;
  yearGroup?: string;
  avatarUrl?: string;
  medicalConditions?: string;
  emergencyNote?: string;
}

export const childrenRepository = {
  async findAllByUserId(userId: string) {
    return prisma.child.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async findByIdAndUserId(childId: string, userId: string) {
    return prisma.child.findFirst({
      where: { id: childId, userId },
    });
  },

  async create(data: CreateChildData) {
    return prisma.child.create({
      data: {
        userId: data.userId,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        yearGroup: data.yearGroup,
        medicalConditions: data.medicalConditions,
        emergencyNote: data.emergencyNote,
        emergencyContacts: {
          create: data.emergencyContacts.map((ec) => ({
            name: ec.name,
            phone: ec.phone,
            relationship: ec.relationship,
          })),
        },
      },
    });
  },

  async updateById(childId: string, data: UpdateChildData) {
    return prisma.child.update({
      where: { id: childId },
      data,
    });
  },

  async updateAvatarUrlById(childId: string, avatarUrl: string) {
    return prisma.child.update({
      where: { id: childId },
      data: { avatarUrl },
    });
  },

  async clearAvatarUrlById(childId: string) {
    return prisma.child.update({
      where: { id: childId },
      data: { avatarUrl: null },
    });
  },

  async softDeleteById(childId: string) {
    // Soft delete — set a deletedAt timestamp by updating and relying on query filters
    // For now we use hard delete; soft delete requires schema migration (Phase 4 concern)
    return prisma.child.delete({ where: { id: childId } });
  },
};
