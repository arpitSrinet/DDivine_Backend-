/**
 * @file children.domain.ts
 * @description Pure domain logic for children. No Prisma, no side effects.
 * @module src/modules/children/children.domain
 */
import type { IChildResponse } from './children.schema.js';

export function mapToChildResponse(child: {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: string;
  yearGroup: string;
  medicalConditions: string | null;
}): IChildResponse {
  return {
    id: child.id,
    firstName: child.firstName,
    lastName: child.lastName,
    dateOfBirth: child.dateOfBirth.toISOString().split('T')[0]!,
    gender: child.gender,
    yearGroup: child.yearGroup,
    ...(child.medicalConditions && { medicalConditions: child.medicalConditions }),
  };
}
