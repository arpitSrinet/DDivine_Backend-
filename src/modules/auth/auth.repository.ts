/**
 * @file auth.repository.ts
 * @description Data access layer for authentication. All Prisma queries live here.
 * @module src/modules/auth/auth.repository
 */
import type { UserRole } from '@prisma/client';

import { prisma } from '@/shared/infrastructure/prisma.js';

interface CreateUserData {
  email: string;
  passwordHash: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  schoolName?: string;
  phone?: string;
  emergencyPhone?: string;
  addressLine1?: string;
  addressLine2?: string;
  town?: string;
  county?: string;
  postcode?: string;
  // School-specific
  registrationNumber?: string;
  schoolType?: string;
  website?: string;
  schoolLogoFileName?: string;
  verificationDocumentFileName?: string;
}

interface CreateChildAtSignupData {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: string;
  yearGroup: string;
  medicalConditions?: string;
  schoolName?: string;
  firstAidPermission?: string;
  emergencyContactPhone?: string;
}

export const authRepository = {
  async findUserByEmailAndRole(email: string, role: UserRole) {
    return prisma.user.findFirst({
      where: { email, role },
    });
  },

  async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  },

  async createUser(data: CreateUserData) {
    return prisma.user.create({ data });
  },

  /**
   * Atomically creates a parent user and optionally a child profile (with emergency contact)
   * in a single transaction. Used by the parent signup flow.
   */
  async createParentWithChild(
    userData: CreateUserData,
    childData: CreateChildAtSignupData | null,
  ) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: userData });

      if (childData) {
        const emergencyContacts = childData.emergencyContactPhone
          ? [
              {
                name: 'Parent/Guardian',
                phone: childData.emergencyContactPhone,
                relationship: 'Parent/Guardian',
              },
            ]
          : [];

        await tx.child.create({
          data: {
            userId: user.id,
            firstName: childData.firstName,
            lastName: childData.lastName,
            dateOfBirth: childData.dateOfBirth,
            gender: childData.gender,
            yearGroup: childData.yearGroup,
            medicalConditions: childData.medicalConditions,
            schoolName: childData.schoolName,
            firstAidPermission: childData.firstAidPermission,
            emergencyContacts:
              emergencyContacts.length > 0
                ? { create: emergencyContacts }
                : undefined,
          },
        });
      }

      return user;
    });
  },
};
