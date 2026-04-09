/**
 * @file notifications.controller.ts
 * @description Fastify request handlers for notifications endpoints.
 * @module src/modules/notifications/notifications.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { notificationsService } from './notifications.service.js';
import type { INotificationIdParam } from './notifications.schema.js';

export const notificationsController = {
  async getNotifications(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const notifications = await notificationsService.getForUser(userId);
    await reply.status(200).send(notifications);
  },

  async markAsRead(
    request: FastifyRequest<{ Params: INotificationIdParam }>,
    reply: FastifyReply,
  ) {
    const userId = request.user!.id;
    const { notificationId } = request.params;
    const notification = await notificationsService.markAsRead(notificationId, userId);
    await reply.status(200).send(notification);
  },

  async markAllAsRead(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    await notificationsService.markAllAsRead(userId);
    await reply.status(200).send({ message: 'All notifications marked as read.' });
  },
};
