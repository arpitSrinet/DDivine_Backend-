import { prisma } from '@/shared/infrastructure/prisma.js';

const CONNECTION_ID = 'default';

type BookingStatus =
  | 'PENDING'
  | 'PENDING_PAYMENT'
  | 'GOVERNMENT_PAYMENT_PENDING'
  | 'CONFIRMED'
  | 'REFUNDED'
  | 'CANCELLED';

export const xeroRepository = {
  // ─── XeroConnection ───────────────────────────────────────────────────────

  async saveConnection(data: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    tokenType: string;
    scope?: string;
    tenantId: string;
  }) {
    return prisma.xeroConnection.upsert({
      where: { id: CONNECTION_ID },
      create: { id: CONNECTION_ID, ...data },
      update: data,
    });
  },

  async findConnection() {
    return prisma.xeroConnection.findUnique({ where: { id: CONNECTION_ID } });
  },

  async updateTokens(data: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    tokenType: string;
    scope?: string;
  }) {
    return prisma.xeroConnection.update({
      where: { id: CONNECTION_ID },
      data,
    });
  },

  // ─── Session Bookings ─────────────────────────────────────────────────────

  async findBookingForInvoice(bookingId: string) {
    return prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: true,
        child: true,
        session: {
          include: {
            service: { select: { title: true } },
          },
        },
      },
    });
  },

  async updateBookingInvoiceLink(
    bookingId: string,
    data: { xeroInvoiceId: string; xeroInvoiceStatus: string },
  ) {
    return prisma.booking.update({
      where: { id: bookingId },
      data: {
        ...data,
        xeroInvoiceSyncedAt: new Date(),
      },
    });
  },

  async findBookingsPendingGovernmentSync() {
    return prisma.booking.findMany({
      where: {
        paymentType: 'GOVERNMENT',
        paymentStatus: 'PENDING',
        xeroInvoiceId: { not: null },
      },
      select: { id: true },
    });
  },

  async findBookingById(bookingId: string) {
    return prisma.booking.findUnique({ where: { id: bookingId } });
  },

  async findBookingInvoiceAccess(bookingId: string) {
    return prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        userId: true,
        xeroInvoiceId: true,
      },
    });
  },

  async updateBookingFromXeroStatus(
    bookingId: string,
    data: {
      paymentStatus: 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';
      bookingStatus: BookingStatus;
      xeroInvoiceStatus: string;
    },
  ) {
    return prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: data.paymentStatus,
        status: data.bookingStatus,
        xeroInvoiceStatus: data.xeroInvoiceStatus,
        xeroInvoiceSyncedAt: new Date(),
      },
    });
  },

  // ─── Event Bookings (CalendarEventBooking) ────────────────────────────────

  async findEventBookingForInvoice(bookingId: string) {
    return prisma.calendarEventBooking.findUnique({
      where: { id: bookingId },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        items: {
          include: {
            slot: {
              select: {
                startTime: true,
                endTime: true,
                eventDate: {
                  select: {
                    date: true,
                    event: { select: { title: true } },
                  },
                },
              },
            },
            child: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  },

  async findEventBookingById(bookingId: string) {
    return prisma.calendarEventBooking.findUnique({ where: { id: bookingId } });
  },

  async findEventBookingInvoiceAccess(bookingId: string) {
    return prisma.calendarEventBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, userId: true, xeroInvoiceId: true },
    });
  },

  async updateEventBookingInvoiceLink(
    bookingId: string,
    data: { xeroInvoiceId: string; xeroInvoiceStatus: string },
  ) {
    return prisma.calendarEventBooking.update({
      where: { id: bookingId },
      data: {
        ...data,
        xeroInvoiceSyncedAt: new Date(),
      },
    });
  },

  async findEventBookingsPendingGovernmentSync() {
    return prisma.calendarEventBooking.findMany({
      where: {
        paymentMethod: 'TAX_FREE_CHILDCARE',
        status: 'GOVERNMENT_PAYMENT_PENDING',
        xeroInvoiceId: { not: null },
      },
      select: { id: true },
    });
  },

  async updateEventBookingFromXeroStatus(
    bookingId: string,
    data: {
      bookingStatus: BookingStatus;
      xeroInvoiceStatus: string;
    },
  ) {
    return prisma.calendarEventBooking.update({
      where: { id: bookingId },
      data: {
        status: data.bookingStatus,
        xeroInvoiceStatus: data.xeroInvoiceStatus,
        xeroInvoiceSyncedAt: new Date(),
      },
    });
  },
};
