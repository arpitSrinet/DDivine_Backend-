/**
 * @file notifications.routes.ts
 * @description Fastify route registration for notifications. All routes require auth.
 * @module src/modules/notifications/notifications.routes
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { validate } from '@/shared/middleware/validate.js';

import { notificationsController } from './notifications.controller.js';
import { NotificationIdParamSchema } from './notifications.schema.js';

const notificationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    title: { type: 'string' },
    body: { type: 'string' },
    isRead: { type: 'boolean' },
    createdAt: { type: 'string' },
  },
};

async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/notifications', {
    schema: {
      tags: ['Notifications'],
      summary: 'Get all notifications for the current user',
      security: [{ BearerAuth: [] }],
      response: { 200: { type: 'array', items: notificationSchema } },
    },
    preHandler: [authMiddleware],
    handler: notificationsController.getNotifications,
  });

  app.patch('/api/v1/notifications/read-all', {
    schema: {
      tags: ['Notifications'],
      summary: 'Mark all notifications as read',
      security: [{ BearerAuth: [] }],
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
      },
    },
    preHandler: [authMiddleware],
    handler: notificationsController.markAllAsRead,
  });

  app.patch('/api/v1/notifications/:notificationId/read', {
    schema: {
      tags: ['Notifications'],
      summary: 'Mark a single notification as read',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { notificationId: { type: 'string' } },
      },
      response: { 200: notificationSchema },
    },
    preHandler: [authMiddleware, validate({ params: NotificationIdParamSchema })],
    handler: notificationsController.markAsRead,
  });
}

export default fp(notificationsRoutes, { name: 'notifications-routes' });
