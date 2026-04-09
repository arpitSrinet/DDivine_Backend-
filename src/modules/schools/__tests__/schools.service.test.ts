/**
 * @file schools.service.test.ts
 * @description Unit tests for schools service profile and booking mapping behavior.
 * @module src/modules/schools/__tests__/schools.service
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { schoolsService } from '../schools.service.js';
import { schoolsRepository } from '../schools.repository.js';

vi.mock('../schools.repository.js', () => ({
  schoolsRepository: {
    findSchoolById: vi.fn(),
    updateSchool: vi.fn(),
    getSchoolBookings: vi.fn(),
  },
}));

const mockSchoolsRepository = vi.mocked(schoolsRepository);

describe('schoolsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ACCOUNT_NOT_FOUND when school profile is missing', async () => {
    mockSchoolsRepository.findSchoolById.mockResolvedValue(null);

    await expect(schoolsService.getProfile('school-1')).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('checks profile existence before updating', async () => {
    mockSchoolsRepository.findSchoolById.mockResolvedValue(null);

    await expect(
      schoolsService.updateProfile('school-1', { website: 'https://example.com' }),
    ).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_FOUND',
      statusCode: 404,
    });

    expect(mockSchoolsRepository.updateSchool).not.toHaveBeenCalled();
  });

  it('maps bookings to contract-safe shape', async () => {
    mockSchoolsRepository.getSchoolBookings.mockResolvedValue([
      {
        id: 'booking-1',
        status: 'PENDING',
        price: { toNumber: () => 22.5 },
        session: {
          date: new Date('2026-04-01T10:00:00.000Z'),
          time: '10:00',
          location: 'Main Hall',
          coachName: 'Coach Sam',
          service: { title: 'Wraparound Care' },
        },
      },
    ] as never);

    const result = await schoolsService.getBookings('school-1');

    expect(result).toEqual([
      {
        id: 'booking-1',
        serviceName: 'Wraparound Care',
        date: '2026-04-01T10:00:00.000Z',
        time: '10:00',
        location: 'Main Hall',
        status: 'pending',
        coachName: 'Coach Sam',
        price: 22.5,
      },
    ]);
  });
});
