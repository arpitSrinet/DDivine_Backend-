/**
 * @file sessions.domain.ts
 * @description Pure domain logic for sessions. Maps Prisma model to API response shape.
 * @module src/modules/sessions/sessions.domain
 */
import type { Prisma } from '@prisma/client';

import type { ISessionResponse } from './sessions.schema.js';

type SessionWithService = Prisma.SessionGetPayload<{
  include: { service: { select: { title: true } } };
}>;

export function mapToSessionResponse(session: SessionWithService): ISessionResponse {
  return {
    id: session.id,
    serviceId: session.serviceId,
    serviceName: session.service.title,
    date: session.date.toISOString(),
    time: session.time,
    location: session.location,
    ...(session.coachName && { coachName: session.coachName }),
    maxCapacity: session.maxCapacity,
    availableSpots: session.maxCapacity - session.currentCapacity,
    minAgeYears: session.minAgeYears,
    maxAgeYears: session.maxAgeYears,
    price: session.price.toNumber(),
  };
}
