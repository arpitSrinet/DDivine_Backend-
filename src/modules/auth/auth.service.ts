/**
 * @file auth.service.ts
 * @description Auth business logic orchestration. Calls repository, validates domain rules, returns typed results.
 * @module src/modules/auth/auth.service
 */
import { AppError } from '@/shared/errors/AppError.js';
import { eventBus } from '@/shared/events/event-bus.js';
import { EventType } from '@/shared/events/event-types.js';
import { redis } from '@/shared/infrastructure/redis.js';
import { comparePassword, hashPassword } from '@/shared/utils/hash.js';
import { getTokenRemainingTtl, signToken, verifyToken } from '@/shared/utils/token.js';
import { validateEmail } from '@/shared/domain/value-objects/Email.js';

import { apiRoleToDbRole, dbRoleToApiRole } from './auth.domain.js';
import { authRepository } from './auth.repository.js';
import type { IAuthSessionResponse, ILogin, IMessageResponse, IParentSignup, ISchoolSignup } from './auth.schema.js';

/**
 * Splits "John Doe Smith" into { firstName: "John", lastName: "Doe Smith" }.
 * If only one word is given, lastName defaults to empty string.
 */
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { firstName: trimmed, lastName: '' };
  }
  return {
    firstName: trimmed.slice(0, spaceIndex).trim(),
    lastName: trimmed.slice(spaceIndex + 1).trim(),
  };
}

export const authService = {
  async signupParent(input: IParentSignup): Promise<IMessageResponse> {
    const email = validateEmail(input.email);

    const existing = await authRepository.findUserByEmail(email);
    if (existing) {
      throw new AppError('EMAIL_ALREADY_EXISTS', 'An account with this email already exists.', 409);
    }

    const passwordHash = await hashPassword(input.password);
    const { firstName, lastName } = splitFullName(input.fullName);

    // Build child data if the frontend included a childProfile
    let childData = null;
    if (input.childProfile) {
      const cp = input.childProfile;
      const { firstName: childFirstName, lastName: childLastName } = splitFullName(cp.childFullName);

      const parsedDob = new Date(cp.childDateOfBirth);
      if (isNaN(parsedDob.getTime())) {
        throw new AppError('VALIDATION_ERROR', 'Invalid child date of birth.', 422);
      }

      childData = {
        firstName: childFirstName,
        lastName: childLastName,
        dateOfBirth: parsedDob,
        gender: cp.gender,
        yearGroup: 'Not specified',
        medicalConditions: cp.medicalNotes ?? undefined,
        schoolName: cp.childSchoolName,
        firstAidPermission: cp.firstAidPermission,
        // Use parent's emergency phone as child's emergency contact
        emergencyContactPhone: input.emergencyPhoneNumber ?? undefined,
      };
    }

    const user = await authRepository.createParentWithChild(
      {
        email,
        passwordHash,
        role: 'PARENT',
        firstName,
        lastName,
        phone: input.phoneNumber,
        emergencyPhone: input.emergencyPhoneNumber,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        town: input.town,
        county: input.county,
        postcode: input.postCode,
      },
      childData,
    );

    eventBus.emit(EventType.USER_SIGNED_UP, {
      userId: user.id,
      email: user.email,
      role: 'parent',
    });

    return { message: 'Account created successfully.' };
  },

  async signupSchool(input: ISchoolSignup): Promise<IMessageResponse> {
    const email = validateEmail(input.adminEmail);

    const existing = await authRepository.findUserByEmail(email);
    if (existing) {
      throw new AppError('EMAIL_ALREADY_EXISTS', 'An account with this email already exists.', 409);
    }

    const passwordHash = await hashPassword(input.password);
    const { firstName, lastName } = splitFullName(input.adminFullName);

    const user = await authRepository.createUser({
      email,
      passwordHash,
      role: 'SCHOOL',
      firstName,
      lastName,
      schoolName: input.schoolName.trim(),
      registrationNumber: input.registrationNumber,
      schoolType: input.schoolType,
      website: input.website,
      schoolLogoFileName: input.schoolLogoFileName,
      verificationDocumentFileName: input.verificationDocumentFileName,
    });

    eventBus.emit(EventType.USER_SIGNED_UP, {
      userId: user.id,
      email: user.email,
      role: 'school',
    });

    return { message: 'Account created successfully.' };
  },

  async login(input: ILogin): Promise<IAuthSessionResponse> {
    const email = validateEmail(input.email);
    const dbRole = apiRoleToDbRole(input.role);

    const user = await authRepository.findUserByEmailAndRole(email, dbRole);
    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email, password, or role.', 401);
    }

    const isPasswordValid = await comparePassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email, password, or role.', 401);
    }

    const apiRole = dbRoleToApiRole(user.role);

    const accessToken = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      role: apiRole,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        ...(user.avatarUrl && { avatarUrl: user.avatarUrl }),
        role: apiRole,
      },
    };
  },

  async logout(token: string): Promise<IMessageResponse> {
    const decoded = verifyToken(token);
    const ttl = getTokenRemainingTtl(decoded);

    if (ttl > 0) {
      await redis.set(`token:blacklist:${decoded.jti}`, '1', 'EX', ttl);
    }

    return { message: 'Logged out successfully.' };
  },
};
