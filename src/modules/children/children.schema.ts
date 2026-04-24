/**
 * @file children.schema.ts
 * @description Zod schemas for children endpoints. Matches locked frontend contract (Section 8.3).
 *
 * Endpoints:
 *   GET    /api/v1/users/me/children            → response: ChildResponse[]
 *   POST   /api/v1/users/me/children            → body: CreateChildSchema → response: ChildResponse
 *   PATCH  /api/v1/users/me/children/:childId   → body: UpdateChildSchema → response: ChildResponse
 *   POST   /api/v1/users/me/children/:childId/avatar → multipart/form-data (field: avatar) → response: avatarUrl
 *   DELETE /api/v1/users/me/children/:childId   → response: 204
 *
 * @module src/modules/children/children.schema
 */
import { z } from 'zod';

export const EmergencyContactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  relationship: z.string().min(1),
});

export const CreateChildSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().datetime({ offset: true }).or(z.string().date()),
  gender: z.string().min(1),
  yearGroup: z.string().min(1),
  medicalConditions: z.string().optional(),
  emergencyNote: z.string().optional(),
  emergencyContacts: z.array(EmergencyContactSchema).min(1, 'At least one emergency contact is required'),
});

export const UpdateChildSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  yearGroup: z.string().optional(),
  medicalConditions: z.string().optional(),
  emergencyNote: z.string().optional(),
});

export const ChildIdParamSchema = z.object({
  childId: z.string().min(1),
});

export const ChildResponseSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.string(),
  gender: z.string(),
  yearGroup: z.string(),
  avatarUrl: z.string().optional(),
  medicalConditions: z.string().optional(),
  emergencyNote: z.string().optional(),
});

export type ICreateChild = z.infer<typeof CreateChildSchema>;
export type IUpdateChild = z.infer<typeof UpdateChildSchema>;
export type IChildIdParam = z.infer<typeof ChildIdParamSchema>;
export type IChildResponse = z.infer<typeof ChildResponseSchema>;
export type IEmergencyContact = z.infer<typeof EmergencyContactSchema>;
