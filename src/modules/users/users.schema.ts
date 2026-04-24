/**
 * @file users.schema.ts
 * @description Zod schemas for user profile endpoints. Matches locked frontend contract (Section 8.2).
 *
 * Endpoints:
 *   GET    /api/v1/users/me           → response: UserProfileResponse
 *   PATCH  /api/v1/users/me           → body: UpdateProfileSchema → response: UserProfileResponse
 *   PATCH  /api/v1/users/me/password  → body: ChangePasswordSchema → response: { message }
 *   DELETE /api/v1/users/me           → response: { message }
 *   POST   /api/v1/users/me/avatar    → multipart → response: { avatarUrl }
 *
 * @module src/modules/users/users.schema
 */
import { z } from 'zod';

export const UserProfileResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().optional(),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  town: z.string().optional(),
  county: z.string().optional(),
  postcode: z.string().optional(),
  schoolName: z.string().optional(),
  schoolType: z.string().optional(),
  registrationNumber: z.string().optional(),
  website: z.string().optional(),
  adminFullName: z.string().optional(),
});

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  town: z.string().optional(),
  county: z.string().optional(),
  postcode: z.string().optional(),
  schoolName: z.string().min(1).optional(),
  schoolType: z.string().min(1).optional(),
  registrationNumber: z.string().min(1).optional(),
  website: z.string().min(1).optional(),
  adminFullName: z.string().min(1).optional(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export type IUserProfileResponse = z.infer<typeof UserProfileResponseSchema>;
export type IUpdateProfile = z.infer<typeof UpdateProfileSchema>;
export type IChangePassword = z.infer<typeof ChangePasswordSchema>;