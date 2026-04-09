/**
 * @file notifications.service.ts
 * @description Notification business logic — creation (called by event handlers) and retrieval.
 * @module src/modules/notifications/notifications.service
 */
import { AppError } from '@/shared/errors/AppError.js';

import type { Prisma } from '@prisma/client';

import { notificationsRepository } from './notifications.repository.js';
import type { INotificationResponse, NotificationType } from './notifications.schema.js';

function mapToResponse(n: {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
}): INotificationResponse {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  };
}

export const notificationsService = {
  async create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    await notificationsRepository.createNotification(data);
  },

  async getForUser(userId: string): Promise<INotificationResponse[]> {
    const notifications = await notificationsRepository.findByUserId(userId);
    return notifications.map(mapToResponse);
  },

  async markAsRead(notificationId: string, userId: string): Promise<INotificationResponse> {
    const notification = await notificationsRepository.findByIdAndUserId(notificationId, userId);
    if (!notification) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'Notification not found.', 404);
    }
    const updated = await notificationsRepository.markAsRead(notificationId);
    return mapToResponse(updated);
  },

  async markAllAsRead(userId: string): Promise<void> {
    await notificationsRepository.markAllAsRead(userId);
  },
};
