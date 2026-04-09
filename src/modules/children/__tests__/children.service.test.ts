/**
 * @file children.service.test.ts
 * @description Unit tests for children service domain rules and ownership checks.
 * @module src/modules/children/__tests__/children.service
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { childrenService } from '../children.service.js';
import { childrenRepository } from '../children.repository.js';

vi.mock('../children.repository.js', () => ({
  childrenRepository: {
    findAllByUserId: vi.fn(),
    findByIdAndUserId: vi.fn(),
    create: vi.fn(),
    updateById: vi.fn(),
    softDeleteById: vi.fn(),
  },
}));

const mockChildrenRepository = vi.mocked(childrenRepository);

describe('childrenService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws EMERGENCY_CONTACT_REQUIRED when creating child without contacts', async () => {
    await expect(
      childrenService.createChild('parent-1', {
        firstName: 'Ava',
        lastName: 'Smith',
        dateOfBirth: '2018-04-02',
        gender: 'female',
        yearGroup: 'Year 2',
        emergencyContacts: [],
      }),
    ).rejects.toMatchObject({
      code: 'EMERGENCY_CONTACT_REQUIRED',
      statusCode: 422,
    });
  });

  it('creates child and maps date to YYYY-MM-DD response', async () => {
    mockChildrenRepository.create.mockResolvedValue({
      id: 'child-1',
      firstName: 'Ava',
      lastName: 'Smith',
      dateOfBirth: new Date('2018-04-02T00:00:00.000Z'),
      gender: 'female',
      yearGroup: 'Year 2',
      medicalConditions: null,
    } as never);

    const result = await childrenService.createChild('parent-1', {
      firstName: 'Ava',
      lastName: 'Smith',
      dateOfBirth: '2018-04-02',
      gender: 'female',
      yearGroup: 'Year 2',
      emergencyContacts: [{ name: 'John', phone: '07000', relationship: 'Father' }],
    });

    expect(result).toEqual({
      id: 'child-1',
      firstName: 'Ava',
      lastName: 'Smith',
      dateOfBirth: '2018-04-02',
      gender: 'female',
      yearGroup: 'Year 2',
    });
  });

  it('throws ACCOUNT_NOT_FOUND when updating a child not owned by parent', async () => {
    mockChildrenRepository.findByIdAndUserId.mockResolvedValue(null);

    await expect(
      childrenService.updateChild('parent-1', 'child-missing', { firstName: 'Updated' }),
    ).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_FOUND',
      statusCode: 404,
    });
  });
});
