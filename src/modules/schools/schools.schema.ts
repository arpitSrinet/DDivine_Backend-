/**
 * @file schools.schema.ts
 * @description Zod schemas for school endpoints.
 *
 * Endpoints:
 *   GET   /api/v1/schools/me           → response: SchoolProfileResponse
 *   PATCH /api/v1/schools/me           → body: UpdateSchoolSchema → response: SchoolProfileResponse
 *   GET   /api/v1/schools/me/bookings  → response: SchoolBookingResponse[]
 *
 * @module src/modules/schools/schools.schema
 */
import { z } from 'zod';

export const SchoolProfileResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  schoolName: z.string(),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  town: z.string().optional(),
  county: z.string().optional(),
  postcode: z.string().optional(),
  registrationNumber: z.string().optional(),
  schoolType: z.string().optional(),
  website: z.string().optional(),
});

export const UpdateSchoolSchema = z.object({
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  town: z.string().optional(),
  county: z.string().optional(),
  postcode: z.string().optional(),
  schoolType: z.string().optional(),
  website: z.string().optional(),
});

export const SchoolBookingResponseSchema = z.object({
  id: z.string(),
  serviceName: z.string(),
  date: z.string(),
  time: z.string(),
  location: z.string(),
  status: z.enum(['confirmed', 'pending', 'cancelled']),
  coachName: z.string().optional(),
  price: z.number().nonnegative().optional(),
});

export type ISchoolProfileResponse = z.infer<typeof SchoolProfileResponseSchema>;
export type IUpdateSchool = z.infer<typeof UpdateSchoolSchema>;
export type ISchoolBookingResponse = z.infer<typeof SchoolBookingResponseSchema>;
