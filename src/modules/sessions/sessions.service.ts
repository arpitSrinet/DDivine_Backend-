/**
 * @file sessions.service.ts
 * @description Business logic for session listing and detail.
 * @module src/modules/sessions/sessions.service
 */
import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResponse } from '@/shared/schemas/common.schema.js';

import { mapToSessionResponse } from './sessions.domain.js';
import { sessionsRepository } from './sessions.repository.js';
import type { ISessionFilter, ISessionResponse } from './sessions.schema.js';

export const sessionsService = {
  async getSessions(filters: ISessionFilter) {
    const { sessions, total } = await sessionsRepository.findAll(filters);

    return buildPaginatedResponse(
      sessions.map(mapToSessionResponse),
      total,
      filters.page,
      filters.pageSize,
    );
  },

  async getSessionById(sessionId: string): Promise<ISessionResponse> {
    const session = await sessionsRepository.findById(sessionId);
    if (!session) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'Session not found.', 404);
    }
    return mapToSessionResponse(session);
  },
};
