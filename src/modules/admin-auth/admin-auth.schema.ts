/**
 * @file admin-auth.schema.ts
 * @description Zod schemas for admin authentication endpoints.
 *
 * Endpoints:
 *   POST /api/v1/admin/auth/login  → body: AdminLoginSchema → response: { accessToken, role, user }
 *
 * @module src/modules/admin-auth/admin-auth.schema
 */
import { z } from 'zod';

export const AdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const AdminUserResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.literal('admin'),
});

export const AdminSessionResponseSchema = z.object({
  accessToken: z.string(),
  role: z.literal('admin'),
  user: AdminUserResponseSchema,
});

export type IAdminLogin = z.infer<typeof AdminLoginSchema>;
export type IAdminSessionResponse = z.infer<typeof AdminSessionResponseSchema>;
