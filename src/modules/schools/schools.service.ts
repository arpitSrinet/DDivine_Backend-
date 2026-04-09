/**
 * @file schools.service.ts
 * @description Schools business logic — profile management and booking history.
 * @module src/modules/schools/schools.service
 */
import type { Prisma } from '@prisma/client';

import { AppError } from '@/shared/errors/AppError.js';
import { BOOKING_STATUS_MAP } from '@/modules/bookings/bookings.schema.js';

import { schoolsRepository } from './schools.repository.js';
import type {
  ISchoolBookingResponse,
  ISchoolProfileResponse,
  IUpdateSchool,
} from './schools.schema.js';

function mapToProfileResponse(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  schoolName: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
  registrationNumber: string | null;
  schoolType: string | null;
  website: string | null;
}): ISchoolProfileResponse {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    schoolName: user.schoolName ?? '',
    ...(user.phone && { phone: user.phone }),
    ...(user.addressLine1 && { addressLine1: user.addressLine1 }),
    ...(user.addressLine2 && { addressLine2: user.addressLine2 }),
    ...(user.town && { town: user.town }),
    ...(user.county && { county: user.county }),
    ...(user.postcode && { postcode: user.postcode }),
    ...(user.registrationNumber && { registrationNumber: user.registrationNumber }),
    ...(user.schoolType && { schoolType: user.schoolType }),
    ...(user.website && { website: user.website }),
  };
}

export const schoolsService = {
  async getProfile(userId: string): Promise<ISchoolProfileResponse> {
    const school = await schoolsRepository.findSchoolById(userId);
    if (!school) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'School profile not found.', 404);
    }
    return mapToProfileResponse(school);
  },

  async updateProfile(userId: string, input: IUpdateSchool): Promise<ISchoolProfileResponse> {
    const existing = await schoolsRepository.findSchoolById(userId);
    if (!existing) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'School profile not found.', 404);
    }

    const updated = await schoolsRepository.updateSchool(userId, input);
    return mapToProfileResponse(updated);
  },

  async getBookings(userId: string): Promise<ISchoolBookingResponse[]> {
    const bookings = await schoolsRepository.getSchoolBookings(userId);
    return bookings.map((b) => ({
      id: b.id,
      serviceName: b.session.service.title,
      date: b.session.date.toISOString(),
      time: b.session.time,
      location: b.session.location,
      status: BOOKING_STATUS_MAP[b.status],
      ...(b.session.coachName && { coachName: b.session.coachName }),
      price: (b.price as Prisma.Decimal).toNumber(),
    }));
  },
};
