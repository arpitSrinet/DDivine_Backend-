/**
 * @file admin-dashboard.routes.ts
 * @description Admin dashboard — summary statistics. Requires ADMIN role.
 * @module src/modules/admin-dashboard/admin-dashboard.routes
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';

const adminGuard = [authMiddleware, requireRole('ADMIN')];

const EVENT_TYPE_MAP: Record<string, string> = {
  TOURNAMENT: 'tournament',
  OPEN_DAY: 'open-day',
  CAMP: 'camp',
  SCHOOL_VISIT: 'school-visit',
  OTHER: 'other',
};

const BOOKING_STATUS_MAP: Record<string, string> = {
  PENDING: 'pending_payment',
  PENDING_PAYMENT: 'pending_payment',
  GOVERNMENT_PAYMENT_PENDING: 'government_payment_pending',
  CONFIRMED: 'confirmed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
};

async function adminDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/admin/dashboard', {
    schema: {
      tags: ['Admin'],
      summary: 'Admin dashboard — summary stats, recent bookings, events, matches',
      security: [{ BearerAuth: [] }],
    },
    preHandler: adminGuard,
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const [
        totalCustomers,
        sessionBookingsCount,
        eventBookingsCount,
        revenueResult,
        activeSessions,
        pendingRefunds,
        upcomingEvents,
        totalMatchesPlayed,
        recentSessionBookingRows,
        recentEventBookingRows,
        upcomingEventRows,
        recentMatchRows,
      ] = await Promise.all([
        // customers = non-admin users
        prisma.user.count({ where: { role: { in: ['PARENT', 'SCHOOL'] } } }),
        prisma.booking.count(),
        prisma.calendarEventBooking.count(),
        // revenue — sum of paid payments (stored as Decimal, convert to pence)
        prisma.payment.aggregate({
          _sum: { amount: true },
          where: { status: 'PAID' },
        }),
        prisma.session.count({ where: { isActive: true } }),
        prisma.refund.count({ where: { status: 'PENDING' } }),
        prisma.calendarEvent.count({
          where: { isPublic: true, date: { gte: todayStart } },
        }),
        prisma.match.count({ where: { status: 'COMPLETED' } }),
        // recent session bookings with user + child + session/service
        prisma.booking.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { firstName: true, lastName: true } },
            child: { select: { firstName: true, lastName: true } },
            session: {
              select: {
                date: true,
                service: { select: { title: true } },
              },
            },
          },
        }),
        // recent event bookings (for unified "recent bookings" on dashboard)
        prisma.calendarEventBooking.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { firstName: true, lastName: true } },
            items: {
              take: 1,
              orderBy: { createdAt: 'asc' },
              include: {
                child: { select: { firstName: true, lastName: true } },
                slot: {
                  include: {
                    eventDate: {
                      include: {
                        event: { select: { title: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        // upcoming public events
        prisma.calendarEvent.findMany({
          where: { isPublic: true, date: { gte: todayStart } },
          orderBy: { date: 'asc' },
          take: 5,
        }),
        // recent completed matches with team names
        prisma.match.findMany({
          where: { status: 'COMPLETED' },
          orderBy: { date: 'desc' },
          take: 5,
          include: {
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        }),
      ]);

      // Convert backend Decimal amount (£) → pence integer for frontend
      const totalRevenuePence = Math.round(
        (revenueResult._sum.amount?.toNumber() ?? 0) * 100,
      );
      const totalBookings = sessionBookingsCount + eventBookingsCount;

      const recentBookings = [
        ...recentSessionBookingRows.map((b) => ({
          id: b.id,
          customerName: `${b.user.firstName} ${b.user.lastName}`.trim(),
          childName: b.child ? `${b.child.firstName} ${b.child.lastName}`.trim() : '',
          sessionTitle: b.session.service.title,
          date: b.session.date.toISOString().split('T')[0],
          status: BOOKING_STATUS_MAP[b.status] ?? b.status.toLowerCase(),
          pricePence: Math.round(b.price.toNumber() * 100),
          createdAt: b.createdAt,
        })),
        ...recentEventBookingRows.map((b) => {
          const firstItem = b.items[0];
          const fallbackName = `${b.user.firstName} ${b.user.lastName}`.trim();
          const customerName = b.fullName?.trim() ? b.fullName.trim() : fallbackName;
          const childName = firstItem?.child
            ? `${firstItem.child.firstName} ${firstItem.child.lastName}`.trim()
            : '';
          const sessionTitle = firstItem?.slot.eventDate.event.title ?? 'Event booking';
          const bookingDate = firstItem?.slot.eventDate.date ?? b.createdAt;
          const totalPaidPence = Math.round((b.totalPaid?.toNumber() ?? 0) * 100);

          return {
            id: b.id,
            customerName,
            childName,
            sessionTitle,
            date: bookingDate.toISOString().split('T')[0],
            status: BOOKING_STATUS_MAP[b.status] ?? b.status.toLowerCase(),
            pricePence: totalPaidPence,
            createdAt: b.createdAt,
          };
        }),
      ]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 10);

      await reply.status(200).send({
        stats: {
          totalCustomers,
          totalBookings,
          activeSessions,
          upcomingEvents,
          totalMatchesPlayed,
          totalRevenuePence,
          pendingRefunds,
        },
        recentBookings: recentBookings.map((b) => ({
          id: b.id,
          customerName: b.customerName,
          childName: b.childName,
          sessionTitle: b.sessionTitle,
          date: b.date,
          status: b.status,
          pricePence: b.pricePence,
        })),
        upcomingEvents: upcomingEventRows.map((e) => ({
          id: e.id,
          title: e.title,
          type: EVENT_TYPE_MAP[e.type] ?? e.type.toLowerCase(),
          date: e.date.toISOString().split('T')[0],
          location: e.location ?? undefined,
        })),
        recentMatches: recentMatchRows.map((m) => ({
          id: m.id,
          homeTeam: m.homeTeam.name,
          awayTeam: m.awayTeam.name,
          homeScore: m.homeScore ?? 0,
          awayScore: m.awayScore ?? 0,
          date: m.date.toISOString().split('T')[0],
        })),
      });
    },
  });
}

export default fp(adminDashboardRoutes, { name: 'admin-dashboard-routes' });
