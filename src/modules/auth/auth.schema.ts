/**
 * @file auth.schema.ts
 * @description Zod schemas for auth endpoints. Field names match what the frontend sends exactly.
 *
 * Endpoints:
 *   POST /api/v1/auth/signup/parent  → body: ParentSignupSchema  → response: { message }
 *   POST /api/v1/auth/signup/school  → body: SchoolSignupSchema  → response: { message }
 *   POST /api/v1/auth/login          → body: LoginSchema         → response: { accessToken, role, user }
 *   POST /api/v1/auth/logout         → (auth required)           → response: { message }
 *
 * Frontend field mapping (frontend → backend stored as):
 *   fullName        → firstName + lastName (split on first space)
 *   phoneNumber     → phone
 *   emergencyPhoneNumber → emergencyPhone
 *   postCode        → postcode
 *   adminEmail      → email (school signup)
 *   adminFullName   → firstName + lastName (school signup)
 *
 * @module src/modules/auth/auth.schema
 */
import { z } from 'zod';

// ─── Child Profile (embedded in parent signup) ───────────────────────────────

export const SignupChildProfileSchema = z.object({
  childFullName: z.string().min(1, 'Enter child full name'),
  childDateOfBirth: z.string().min(1, 'Enter child date of birth'),
  childSchoolName: z.string().min(1, 'Enter child school name'),
  firstAidPermission: z.string().min(1, 'First aid permission is required'),
  gender: z.string().min(1, 'Gender is required'),
  medicalNotes: z.string().optional(),
});

// ─── Parent Signup ────────────────────────────────────────────────────────────

export const ParentSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Enter your full name'),
  phoneNumber: z.string().min(1, 'Phone number is required'),
  emergencyPhoneNumber: z.string().min(1, 'Emergency phone number is required'),
  addressLine1: z.string().min(1, 'Address is required'),
  addressLine2: z.string().optional(),
  town: z.string().min(1, 'Town is required'),
  county: z.string().optional(),
  postCode: z.string().min(1, 'Post code is required'),
  childProfile: SignupChildProfileSchema.nullable().optional(),
});

// ─── School Signup ────────────────────────────────────────────────────────────

export const SchoolSignupSchema = z.object({
  adminEmail: z.string().email(),
  adminFullName: z.string().min(1, 'Enter your full name'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  schoolName: z.string().min(1, 'Enter school name'),
  registrationNumber: z.string().min(1, 'Registration number is required'),
  schoolType: z.string().min(1, 'School type is required'),
  website: z.string().min(1, 'Website is required'),
  schoolLogoFileName: z.string().min(1, 'School logo is required'),
  verificationDocumentFileName: z.string().min(1, 'Verification document is required'),
});

// ─── Login ────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  role: z.enum(['parent', 'school', 'admin']),
});

// ─── Responses ────────────────────────────────────────────────────────────────

export const AuthUserResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().optional(),
  role: z.enum(['parent', 'school', 'admin']),
});

export const AuthSessionResponseSchema = z.object({
  accessToken: z.string(),
  role: z.enum(['parent', 'school', 'admin']),
  user: AuthUserResponseSchema,
});

export const MessageResponseSchema = z.object({
  message: z.string(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type IParentSignup = z.infer<typeof ParentSignupSchema>;
export type ISchoolSignup = z.infer<typeof SchoolSignupSchema>;
export type ISignupChildProfile = z.infer<typeof SignupChildProfileSchema>;
export type ILogin = z.infer<typeof LoginSchema>;
export type IAuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
export type IMessageResponse = z.infer<typeof MessageResponseSchema>;
