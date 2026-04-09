/**
 * @file admin-sessions.schema.ts
 * @description Zod schemas for admin sessions management endpoints.
 * @module src/modules/admin-sessions/admin-sessions.schema
 */
import { z } from 'zod';

const CreateSessionCanonicalSchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().datetime({ offset: true }).or(z.string().date()),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM format'),
  location: z.string().min(1),
  coachName: z.string().optional(),
  maxCapacity: z.number().int().positive(),
  minAgeYears: z.number().int().nonnegative(),
  maxAgeYears: z.number().int().positive(),
  price: z.number().nonnegative(),
});

const UpdateSessionCanonicalSchema = z.object({
  date: z.string().optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  location: z.string().min(1).optional(),
  coachName: z.string().optional(),
  maxCapacity: z.number().int().positive().optional(),
  minAgeYears: z.number().int().nonnegative().optional(),
  maxAgeYears: z.number().int().positive().optional(),
  price: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export const CreateSessionSchema = z
  .object({
    serviceId: z.string().min(1),
    date: z.string(),
    time: z.string(),
    location: z.string(),
    coachName: z.string().optional(),
    coach: z.string().optional(),
    maxCapacity: z.number().optional(),
    capacity: z.number().optional(),
    minAgeYears: z.number().optional(),
    minAge: z.number().optional(),
    maxAgeYears: z.number().optional(),
    maxAge: z.number().optional(),
    price: z.number().optional(),
    pricePence: z.number().optional(),
  })
  .transform((body) => ({
    serviceId: body.serviceId,
    date: body.date,
    time: body.time,
    location: body.location,
    coachName: body.coachName ?? body.coach,
    maxCapacity: body.maxCapacity ?? body.capacity,
    minAgeYears: body.minAgeYears ?? body.minAge,
    maxAgeYears: body.maxAgeYears ?? body.maxAge,
    price: body.price ?? (body.pricePence !== undefined ? body.pricePence / 100 : undefined),
  }))
  .pipe(CreateSessionCanonicalSchema);

export const UpdateSessionSchema = z
  .object({
    date: z.string().optional(),
    time: z.string().optional(),
    location: z.string().optional(),
    coachName: z.string().optional(),
    coach: z.string().optional(),
    maxCapacity: z.number().optional(),
    capacity: z.number().optional(),
    minAgeYears: z.number().optional(),
    minAge: z.number().optional(),
    maxAgeYears: z.number().optional(),
    maxAge: z.number().optional(),
    price: z.number().optional(),
    pricePence: z.number().optional(),
    isActive: z.boolean().optional(),
  })
  .transform((body) => ({
    date: body.date,
    time: body.time,
    location: body.location,
    coachName: body.coachName ?? body.coach,
    maxCapacity: body.maxCapacity ?? body.capacity,
    minAgeYears: body.minAgeYears ?? body.minAge,
    maxAgeYears: body.maxAgeYears ?? body.maxAge,
    price: body.price ?? (body.pricePence !== undefined ? body.pricePence / 100 : undefined),
    isActive: body.isActive,
  }))
  .pipe(UpdateSessionCanonicalSchema);

export const SessionIdParamSchema = z.object({
  sessionId: z.string().min(1),
});

export type ICreateSession = z.infer<typeof CreateSessionSchema>;
export type IUpdateSession = z.infer<typeof UpdateSessionSchema>;
export type ISessionIdParam = z.infer<typeof SessionIdParamSchema>;
