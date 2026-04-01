/**
 * @file assertEmergencyContactExists.ts
 * @description Asserts at least one emergency contact is provided when creating a child.
 * @module src/shared/domain/invariants/assertEmergencyContactExists
 */
import { EmergencyContactMissingError } from '@/shared/domain/errors/EmergencyContactMissingError.js';

interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export function assertEmergencyContactExists(contacts: EmergencyContact[]): void {
  if (!contacts || contacts.length === 0) {
    throw new EmergencyContactMissingError(
      'At least one emergency contact is required.',
    );
  }
}
