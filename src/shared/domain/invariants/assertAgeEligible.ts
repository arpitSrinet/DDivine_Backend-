/**
 * @file assertAgeEligible.ts
 * @description Asserts a child's age falls within a session's min/max range at the session date.
 * @module src/shared/domain/invariants/assertAgeEligible
 */
import { calculateAgeAtDate } from '@/shared/domain/value-objects/DateOfBirth.js';
import { AgeIneligibleError } from '@/shared/domain/errors/AgeIneligibleError.js';

interface ChildAge {
  dateOfBirth: Date;
}

interface SessionAgeRange {
  date: Date;
  minAgeYears: number;
  maxAgeYears: number;
}

export function assertAgeEligible(child: ChildAge, session: SessionAgeRange): void {
  const ageAtSession = calculateAgeAtDate(child.dateOfBirth, session.date);

  if (ageAtSession < session.minAgeYears || ageAtSession > session.maxAgeYears) {
    throw new AgeIneligibleError(
      `Child is ${ageAtSession} years old. Session requires age ${session.minAgeYears}–${session.maxAgeYears}.`,
    );
  }
}
