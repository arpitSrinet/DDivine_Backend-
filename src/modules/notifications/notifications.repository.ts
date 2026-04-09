/**
 * @file notifications.repository.ts
 * @description Data access layer for notifications. All Prisma queries live here.
 * @module src/modules/notifications/notifications.repository
 */
import type { Prisma } from '@prisma/client';

import { prisma } from '@/shared/infrastructure/prisma.js';

export const notificationsRepository = {
  async createNotification(data: {
    userId: string;
    type: string;
    title: string;
    body: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.notification.create({ data });
  },

  async findByUserId(userId: string) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findByIdAndUserId(notificationId: string, userId: string) {
    return prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
  },

  async markAsRead(notificationId: string) {
    return prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  },

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  },
};
