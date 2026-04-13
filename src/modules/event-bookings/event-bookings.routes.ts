/**
 * @file event-bookings.routes.ts
 * @description Event booking detail, multi-step booking intents, confirmation, and receipt download.
 * @module src/modules/event-bookings/event-bookings.routes
 */
import type {
  BookingStatus,
  EventBookingIntent,
  EventPaymentMethod,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import PDFDocument from 'pdfkit';
import { z } from 'zod';

import { env } from '@/config/env.js';
import { AppError } from '@/shared/errors/AppError.js';
import { assertAgeEligible } from '@/shared/domain/invariants/assertAgeEligible.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';
import { getStripeClient } from '@/shared/utils/stripe.js';
import { withTransaction } from '@/shared/utils/transaction.js';

type EventAddon = {
  code: string;
  label: string;
  price: number;
  defaultSelected?: boolean;
};

type SelectedAddon = {
  code: string;
  selected: boolean;
};

type RequirementGroup = {
  heading: string;
  items: string[];
};

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const parentGuard = [authMiddleware, requireRole('PARENT')];

const EventIdParamSchema = z.object({
  eventId: z.string().min(1),
});

const IntentIdParamSchema = z.object({
  intentId: z.string().min(1),
});

const BookingIdParamSchema = z.object({
  bookingId: z.string().min(1),
});

const CreateIntentSchema = z.object({
  eventId: z.string().min(1),
});

const AttendeeSchema = z.object({
  childId: z.string().min(1),
  medicalNotes: z.string().max(2000).optional(),
  addons: z
    .array(
      z.object({
        code: z.string().min(1),
        selected: z.boolean(),
      }),
    )
    .default([]),
});

const ContactSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
});

const PaymentSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('stripe'),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  }),
  z.object({
    method: z.literal('tax_free_childcare'),
    taxFreeChildcareRef: z.string().min(1),
  }),
  z.object({
    method: z.literal('card'),
    provider: z.string().min(1),
    paymentMethodId: z.string().min(1),
  }),
]);

const ConfirmIntentSchema = z.object({
  checkoutSessionId: z.string().min(1).optional(),
});

function normalizeCheckoutSessionId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  const isTemplatePlaceholder =
    (normalized.startsWith('{') && normalized.endsWith('}')) ||
    /CHECKOUT_SESSION_ID/i.test(normalized);
  return isTemplatePlaceholder ? undefined : normalized;
}

function isRetriableConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes('P2034') ||
    error.message.includes('write conflict') ||
    error.message.includes('deadlock') ||
    error.message.includes('could not serialize')
  );
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

function toDateOnly(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString().split('T')[0] : undefined;
}

function parseEventAddons(value: Prisma.JsonValue | null | undefined): EventAddon[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const code = typeof item.code === 'string' ? item.code : undefined;
    const label = typeof item.label === 'string' ? item.label : undefined;
    const price = typeof item.price === 'number' ? item.price : undefined;
    if (!code || !label || price === undefined) return [];
    return [
      {
        code,
        label,
        price,
        defaultSelected: typeof item.defaultSelected === 'boolean' ? item.defaultSelected : false,
      },
    ];
  });
}

function parseSelectedAddons(value: Prisma.JsonValue | null | undefined): SelectedAddon[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const code = typeof item.code === 'string' ? item.code : undefined;
    const selected = typeof item.selected === 'boolean' ? item.selected : undefined;
    if (!code || selected === undefined) return [];
    return [{ code, selected }];
  });
}

function parseRequirements(value: Prisma.JsonValue | null | undefined): RequirementGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const heading = typeof item.heading === 'string' ? item.heading : undefined;
    const rawItems = Array.isArray(item.items) ? item.items : undefined;
    if (!heading || !rawItems) return [];
    const items = rawItems.filter((entry): entry is string => typeof entry === 'string');
    return [{ heading, items }];
  });
}

function getEventStartDate(event: {
  startDate: Date | null;
  date: Date;
}): Date {
  return event.startDate ?? event.date;
}

function getEventStartTime(event: {
  startTime: string | null;
  time: string;
}): string {
  return event.startTime ?? event.time;
}

function computeSummary(
  event: {
    currency: string;
    subtotal: Prisma.Decimal | number;
    serviceFee: Prisma.Decimal | number;
    addons: Prisma.JsonValue | null;
  },
  selectedAddons: SelectedAddon[],
) {
  const availableAddons = parseEventAddons(event.addons);
  const selectedCodes = new Set(selectedAddons.filter((item) => item.selected).map((item) => item.code));
  const addonsTotal = availableAddons
    .filter((addon) => selectedCodes.has(addon.code))
    .reduce((sum, addon) => sum + addon.price, 0);
  const subtotal = toNumber(event.subtotal);
  const serviceFee = toNumber(event.serviceFee);
  const discountTotal = 0;
  const total = Number((subtotal + addonsTotal + serviceFee - discountTotal).toFixed(2));
  return {
    currency: event.currency,
    subtotal,
    addonsTotal,
    discountTotal,
    serviceFee,
    total,
  };
}

function mapEventForBooking(event: {
  id: string;
  title: string;
  description: string | null;
  type: string;
  category: string | null;
  location: string;
  date: Date;
  time: string;
  startDate: Date | null;
  endDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  minAgeYears: number | null;
  maxAgeYears: number | null;
  currency: string;
  subtotal: Prisma.Decimal | number;
  serviceFee: Prisma.Decimal | number;
  addons: Prisma.JsonValue | null;
  requirements: Prisma.JsonValue | null;
  banner: { url: string } | null;
}) {
  return {
    id: event.id,
    title: event.title,
    type: event.type,
    category: event.category ?? 'general',
    description: event.description ?? '',
    location: event.location,
    startDate: toDateOnly(getEventStartDate(event)),
    endDate: toDateOnly(event.endDate ?? getEventStartDate(event)),
    startTime: getEventStartTime(event),
    endTime: event.endTime ?? getEventStartTime(event),
    minAgeYears: event.minAgeYears ?? 0,
    maxAgeYears: event.maxAgeYears ?? 99,
    bannerUrl: event.banner?.url,
    addons: parseEventAddons(event.addons),
    pricing: computeSummary(event, []),
    requirements: parseRequirements(event.requirements),
  };
}

function mapIntent(
  intent: EventBookingIntent & {
    event: {
      currency: string;
      subtotal: Prisma.Decimal;
      serviceFee: Prisma.Decimal;
      addons: Prisma.JsonValue | null;
    };
    child: {
      firstName: string;
      lastName: string;
    } | null;
  },
) {
  const attendeeAddons = parseSelectedAddons(intent.addons);
  return {
    intentId: intent.id,
    eventId: intent.eventId,
    status: intent.status.toLowerCase(),
    currentStep: intent.currentStep,
    expiresAt: intent.expiresAt.toISOString(),
    ...(intent.childId || intent.medicalNotes || attendeeAddons.length > 0
      ? {
          attendee: {
            ...(intent.childId ? { childId: intent.childId } : {}),
            ...(intent.child ? { childName: `${intent.child.firstName} ${intent.child.lastName}` } : {}),
            ...(intent.medicalNotes ? { medicalNotes: intent.medicalNotes } : {}),
            addons: attendeeAddons,
          },
        }
      : {}),
    ...(intent.fullName || intent.email || intent.phone
      ? {
          contact: {
            ...(intent.fullName ? { fullName: intent.fullName } : {}),
            ...(intent.email ? { email: intent.email } : {}),
            ...(intent.phone ? { phone: intent.phone } : {}),
          },
        }
      : {}),
    ...(intent.paymentMethod || intent.stripeCheckoutUrl
      ? {
          payment: {
            ...(intent.paymentMethod ? { method: intent.paymentMethod.toLowerCase() } : {}),
            ...(intent.stripeCheckoutUrl ? { checkoutUrl: intent.stripeCheckoutUrl } : {}),
          },
        }
      : {}),
    summary: {
      currency: intent.currency,
      subtotal: toNumber(intent.subtotal),
      addonsTotal: toNumber(intent.addonsTotal),
      discountTotal: toNumber(intent.discountTotal),
      serviceFee: toNumber(intent.serviceFee),
      total: toNumber(intent.total),
    },
  };
}

function mapConfirmation(booking: {
  id: string;
  bookingReference: string | null;
  status: BookingStatus;
  childId: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  paymentMethod: EventPaymentMethod | null;
  currency: string;
  subtotal: Prisma.Decimal | number;
  addonsTotal: Prisma.Decimal | number;
  discountTotal: Prisma.Decimal | number;
  serviceFee: Prisma.Decimal | number;
  totalPaid: Prisma.Decimal | number;
  receiptUrl: string | null;
  event: {
    id: string;
    title: string;
    location: string;
    date: Date;
    time: string;
    startDate: Date | null;
    endDate: Date | null;
    startTime: string | null;
    endTime: string | null;
  };
  child: { firstName: string; lastName: string } | null;
}) {
  const statusMap: Record<BookingStatus, 'pending_payment' | 'government_payment_pending' | 'confirmed' | 'refunded' | 'cancelled'> = {
    PENDING: 'pending_payment',
    PENDING_PAYMENT: 'pending_payment',
    GOVERNMENT_PAYMENT_PENDING: 'government_payment_pending',
    CONFIRMED: 'confirmed',
    REFUNDED: 'refunded',
    CANCELLED: 'cancelled',
  };
  return {
    status: statusMap[booking.status],
    bookingId: booking.id,
    bookingReference: booking.bookingReference ?? booking.id.toUpperCase().slice(0, 8),
    attendee: {
      childId: booking.childId,
      childName: booking.child ? `${booking.child.firstName} ${booking.child.lastName}` : undefined,
    },
    contact: {
      fullName: booking.fullName ?? undefined,
      email: booking.email ?? undefined,
      phone: booking.phone ?? undefined,
    },
    event: {
      id: booking.event.id,
      title: booking.event.title,
      venue: booking.event.location,
      dateStart: toDateOnly(getEventStartDate(booking.event)),
      dateEnd: toDateOnly(booking.event.endDate ?? getEventStartDate(booking.event)),
      timeStart: getEventStartTime(booking.event),
      timeEnd: booking.event.endTime ?? undefined,
    },
    payment: {
      method: booking.paymentMethod?.toLowerCase() ?? undefined,
      currency: booking.currency,
      subtotal: toNumber(booking.subtotal),
      addonsTotal: toNumber(booking.addonsTotal),
      discountTotal: toNumber(booking.discountTotal),
      serviceFee: toNumber(booking.serviceFee),
      totalPaid: toNumber(booking.totalPaid),
    },
    receipt: {
      downloadUrl: booking.receiptUrl ?? `${env.BASE_URL}/api/v1/bookings/${booking.id}/receipt`,
    },
  };
}

async function ensureActiveIntent(
  intentId: string,
  userId: string,
): Promise<
  EventBookingIntent & {
    event: {
      id: string;
      title: string;
      currency: string;
      subtotal: Prisma.Decimal;
      serviceFee: Prisma.Decimal;
      addons: Prisma.JsonValue | null;
      startDate: Date | null;
      date: Date;
      minAgeYears: number | null;
      maxAgeYears: number | null;
    };
    child: {
      firstName: string;
      lastName: string;
    } | null;
  }
> {
  const intent = await prisma.eventBookingIntent.findFirst({
    where: { id: intentId, userId },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          currency: true,
          subtotal: true,
          serviceFee: true,
          addons: true,
          startDate: true,
          date: true,
          minAgeYears: true,
          maxAgeYears: true,
        },
      },
      child: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (!intent) {
    throw new AppError('ACCOUNT_NOT_FOUND', 'Booking intent not found.', 404);
  }

  if (intent.status !== 'CONFIRMED' && intent.status !== 'CANCELLED' && intent.expiresAt < new Date()) {
    const updated = await prisma.eventBookingIntent.update({
      where: { id: intent.id },
      data: { status: 'EXPIRED', currentStep: 'expired' },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            currency: true,
            subtotal: true,
            serviceFee: true,
            addons: true,
            startDate: true,
            date: true,
            minAgeYears: true,
            maxAgeYears: true,
          },
        },
        child: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    throw new AppError('INTENT_EXPIRED', 'Booking intent has expired.', 409, {
      errors: [{ field: 'intentId', message: updated.id }],
    });
  }

  return intent;
}

async function generateBookingReference(tx: TxClient): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `EVT${Math.random().toString().slice(2, 8)}`;
    const existing = await tx.calendarEventBooking.findUnique({
      where: { bookingReference: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new AppError('SERVER_ERROR', 'Unable to generate a booking reference.', 500);
}

async function generateReceiptPdf(payload: {
  bookingReference: string;
  eventTitle: string;
  venue: string;
  dateStart: string;
  dateEnd: string;
  attendee: string;
  contact: string;
  email: string;
  phone: string;
  paymentMethod: string;
  totalPaid: string;
}): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50 });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(22).text('DDivine Training', { align: 'right' });
    doc.moveDown(1.5);
    doc.fontSize(18).text('EVENT BOOKING RECEIPT');
    doc.moveDown();
    doc.fontSize(10);
    doc.text(`Booking Reference: ${payload.bookingReference}`);
    doc.text(`Generated At: ${new Date().toLocaleString('en-GB')}`);
    doc.moveDown();

    doc.fontSize(12).text('Booking Details');
    doc.fontSize(10);
    doc.text(`Event: ${payload.eventTitle}`);
    doc.text(`Venue: ${payload.venue}`);
    doc.text(`Date Start: ${payload.dateStart}`);
    doc.text(`Date End: ${payload.dateEnd}`);
    doc.moveDown();

    doc.fontSize(12).text('Attendee & Contact');
    doc.fontSize(10);
    doc.text(`Attendee: ${payload.attendee}`);
    doc.text(`Contact: ${payload.contact}`);
    doc.text(`Email: ${payload.email}`);
    doc.text(`Phone: ${payload.phone}`);
    doc.moveDown();

    doc.fontSize(12).text('Payment');
    doc.fontSize(10);
    doc.text(`Payment Method: ${payload.paymentMethod}`);
    doc.text(`Total Paid: ${payload.totalPaid}`);

    doc.end();
  });
}

async function eventBookingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/events/:eventId/booking-detail', {
    schema: {
      tags: ['Events'],
      summary: 'Get booking-ready event details',
      params: { type: 'object', properties: { eventId: { type: 'string' } } },
    },
    preHandler: [validate({ params: EventIdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: { eventId: string } }>, reply: FastifyReply) => {
      const event = await prisma.calendarEvent.findFirst({
        where: { id: request.params.eventId, isPublic: true },
        include: { banner: { select: { url: true } } },
      });
      if (!event) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);
      await reply.status(200).send({ data: mapEventForBooking(event) });
    },
  });

  app.post('/api/v1/bookings/intents', {
    schema: {
      tags: ['Bookings'],
      summary: 'Create an event booking intent',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...parentGuard, validate({ body: CreateIntentSchema })],
    handler: async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateIntentSchema> }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user!.id;
      const event = await prisma.calendarEvent.findFirst({
        where: { id: request.body.eventId, isPublic: true },
        select: {
          id: true,
          currency: true,
          subtotal: true,
          serviceFee: true,
          addons: true,
        },
      });
      if (!event) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);

      const existing = await prisma.eventBookingIntent.findFirst({
        where: {
          eventId: event.id,
          userId,
          status: { in: ['DRAFT', 'ATTENDEE_COMPLETED', 'CONTACT_COMPLETED', 'PAYMENT_SELECTED'] },
          expiresAt: { gt: new Date() },
        },
        include: {
          event: {
            select: { currency: true, subtotal: true, serviceFee: true, addons: true },
          },
          child: {
            select: { firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        await reply.status(200).send({ data: mapIntent(existing) });
        return;
      }

      const defaultAddons = parseEventAddons(event.addons).map((addon) => ({
        code: addon.code,
        selected: addon.defaultSelected ?? false,
      }));
      const summary = computeSummary(event, defaultAddons);

      const intent = await prisma.eventBookingIntent.create({
        data: {
          eventId: event.id,
          userId,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          addons: defaultAddons as unknown as Prisma.InputJsonValue,
          currency: summary.currency,
          subtotal: summary.subtotal,
          addonsTotal: summary.addonsTotal,
          discountTotal: summary.discountTotal,
          serviceFee: summary.serviceFee,
          total: summary.total,
        },
        include: {
          event: {
            select: { currency: true, subtotal: true, serviceFee: true, addons: true },
          },
          child: {
            select: { firstName: true, lastName: true },
          },
        },
      });

      await reply.status(201).send({ data: mapIntent(intent) });
    },
  });

  app.get('/api/v1/bookings/intents/:intentId', {
    schema: {
      tags: ['Bookings'],
      summary: 'Get an event booking intent',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...parentGuard, validate({ params: IntentIdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: { intentId: string } }>, reply: FastifyReply) => {
      const intent = await ensureActiveIntent(request.params.intentId, request.user!.id);
      await reply.status(200).send({ data: mapIntent(intent) });
    },
  });

  app.patch('/api/v1/bookings/intents/:intentId/attendee', {
    schema: {
      tags: ['Bookings'],
      summary: 'Save attendee step for an event booking intent',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...parentGuard, validate({ params: IntentIdParamSchema, body: AttendeeSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: { intentId: string };
        Body: z.infer<typeof AttendeeSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user!.id;
      const intent = await ensureActiveIntent(request.params.intentId, userId);
      const child = await prisma.child.findFirst({
        where: { id: request.body.childId, userId },
      });
      if (!child) throw new AppError('ACCOUNT_NOT_FOUND', 'Child not found.', 404);

      if (intent.event.minAgeYears !== null && intent.event.maxAgeYears !== null) {
        assertAgeEligible(child, {
          date: intent.event.startDate ?? intent.event.date,
          minAgeYears: intent.event.minAgeYears,
          maxAgeYears: intent.event.maxAgeYears,
        });
      }

      const summary = computeSummary(intent.event, request.body.addons);
      const updated = await prisma.eventBookingIntent.update({
        where: { id: intent.id },
        data: {
          childId: request.body.childId,
          medicalNotes: request.body.medicalNotes,
          addons: request.body.addons as unknown as Prisma.InputJsonValue,
          status: 'ATTENDEE_COMPLETED',
          currentStep: 'contact',
          currency: summary.currency,
          subtotal: summary.subtotal,
          addonsTotal: summary.addonsTotal,
          discountTotal: summary.discountTotal,
          serviceFee: summary.serviceFee,
          total: summary.total,
        },
        include: {
          event: {
            select: { currency: true, subtotal: true, serviceFee: true, addons: true },
          },
          child: {
            select: { firstName: true, lastName: true },
          },
        },
      });
      await reply.status(200).send({ data: mapIntent(updated) });
    },
  });

  app.patch('/api/v1/bookings/intents/:intentId/contact', {
    schema: {
      tags: ['Bookings'],
      summary: 'Save contact step for an event booking intent',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...parentGuard, validate({ params: IntentIdParamSchema, body: ContactSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: { intentId: string };
        Body: z.infer<typeof ContactSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const intent = await ensureActiveIntent(request.params.intentId, request.user!.id);
      const updated = await prisma.eventBookingIntent.update({
        where: { id: intent.id },
        data: {
          fullName: request.body.fullName,
          email: request.body.email,
          phone: request.body.phone,
          status: 'CONTACT_COMPLETED',
          currentStep: 'payment',
        },
        include: {
          event: {
            select: { currency: true, subtotal: true, serviceFee: true, addons: true },
          },
          child: {
            select: { firstName: true, lastName: true },
          },
        },
      });
      await reply.status(200).send({ data: mapIntent(updated) });
    },
  });

  app.patch('/api/v1/bookings/intents/:intentId/payment', {
    schema: {
      tags: ['Bookings'],
      summary: 'Select payment method for an event booking intent',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...parentGuard, validate({ params: IntentIdParamSchema, body: PaymentSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: { intentId: string };
        Body: z.infer<typeof PaymentSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const intent = await ensureActiveIntent(request.params.intentId, request.user!.id);
      if (!intent.childId) throw new AppError('VALIDATION_ERROR', 'Attendee step must be completed first.', 422);
      if (!intent.fullName || !intent.email || !intent.phone) {
        throw new AppError('VALIDATION_ERROR', 'Contact step must be completed first.', 422);
      }

      let paymentMethod: EventPaymentMethod = 'STRIPE';
      let stripeCheckoutSessionId: string | undefined;
      let stripePaymentIntentId: string | undefined;
      let stripeCheckoutUrl: string | undefined;
      let paymentProvider: string | undefined;
      let taxFreeChildcareRef: string | undefined;

      if (request.body.method === 'stripe') {
        const frontendBaseUrl = env.CORS_ORIGIN.split(',')[0]?.trim().replace(/\/+$/, '') || env.BASE_URL;
        const defaultSuccessUrl = `${frontendBaseUrl}/events/checkout/success`;
        const defaultCancelUrl = `${frontendBaseUrl}/events/checkout/cancel`;
        const stripe = getStripeClient();
        const event = await prisma.calendarEvent.findUnique({
          where: { id: intent.eventId },
          select: { title: true },
        });
        if (!event) throw new AppError('ACCOUNT_NOT_FOUND', 'Event not found.', 404);

        const session = await stripe.checkout.sessions.create(
          {
            mode: 'payment',
            success_url: request.body.successUrl ?? defaultSuccessUrl,
            cancel_url: request.body.cancelUrl ?? defaultCancelUrl,
            client_reference_id: intent.id,
            customer_email: intent.email ?? request.user!.email,
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: intent.currency.toLowerCase(),
                  unit_amount: Math.round(toNumber(intent.total) * 100),
                  product_data: {
                    name: event.title,
                    description: 'Event booking',
                  },
                },
              },
            ],
            metadata: {
              intentId: intent.id,
              eventId: intent.eventId,
              userId: request.user!.id,
            },
            payment_intent_data: {
              metadata: {
                intentId: intent.id,
                eventId: intent.eventId,
                userId: request.user!.id,
              },
            },
          },
          { idempotencyKey: `event-intent-${intent.id}` },
        );
        paymentMethod = 'STRIPE';
        stripeCheckoutSessionId = session.id;
        stripeCheckoutUrl = session.url ?? undefined;
        stripePaymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : undefined;
      } else if (request.body.method === 'tax_free_childcare') {
        paymentMethod = 'TAX_FREE_CHILDCARE';
        paymentProvider = 'hmrc';
        taxFreeChildcareRef = request.body.taxFreeChildcareRef;
      } else {
        paymentMethod = 'CARD';
        paymentProvider = request.body.provider;
      }

      const updated = await prisma.eventBookingIntent.update({
        where: { id: intent.id },
        data: {
          paymentMethod,
          paymentProvider,
          taxFreeChildcareRef,
          stripeCheckoutSessionId,
          stripePaymentIntentId,
          stripeCheckoutUrl,
          status: 'PAYMENT_SELECTED',
          currentStep: 'payment',
        },
        include: {
          event: {
            select: { currency: true, subtotal: true, serviceFee: true, addons: true },
          },
          child: {
            select: { firstName: true, lastName: true },
          },
        },
      });

      await reply.status(200).send({ data: mapIntent(updated) });
    },
  });

  app.post('/api/v1/bookings/intents/:intentId/confirm', {
    schema: {
      tags: ['Bookings'],
      summary: 'Confirm an event booking intent',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...parentGuard, validate({ params: IntentIdParamSchema, body: ConfirmIntentSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: { intentId: string };
        Body: z.infer<typeof ConfirmIntentSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user!.id;
      const intent = await prisma.eventBookingIntent.findFirst({
        where: { id: request.params.intentId, userId },
        include: {
          event: true,
          child: { select: { id: true, firstName: true, lastName: true } },
          booking: {
            include: {
              event: true,
              child: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      if (!intent) throw new AppError('ACCOUNT_NOT_FOUND', 'Booking intent not found.', 404);
      if (intent.booking) {
        await reply.status(200).send({ data: mapConfirmation(intent.booking) });
        return;
      }
      if (intent.expiresAt < new Date()) {
        await prisma.eventBookingIntent.update({
          where: { id: intent.id },
          data: { status: 'EXPIRED', currentStep: 'expired' },
        });
        throw new AppError('INTENT_EXPIRED', 'Booking intent has expired.', 409);
      }

      let checkoutSessionId = intent.stripeCheckoutSessionId ?? undefined;
      let stripePaymentIntentId = intent.stripePaymentIntentId ?? undefined;
      if (intent.paymentMethod === 'STRIPE') {
        const requestedCheckoutSessionId = normalizeCheckoutSessionId(request.body.checkoutSessionId);
        checkoutSessionId = requestedCheckoutSessionId ?? intent.stripeCheckoutSessionId ?? undefined;
        if (!checkoutSessionId) {
          throw new AppError(
            'VALIDATION_ERROR',
            'A valid checkoutSessionId is required for Stripe confirmation.',
            422,
          );
        }
        const stripe = getStripeClient();
        const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
          expand: ['payment_intent'],
        });
        if (session.client_reference_id !== intent.id) {
          throw new AppError('VALIDATION_ERROR', 'Stripe session does not match the booking intent.', 409);
        }
        if (session.payment_status !== 'paid') {
          throw new AppError('VALIDATION_ERROR', 'Stripe checkout has not been paid.', 409);
        }
        stripePaymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;
      }

      let created;
      try {
        created = await withTransaction(prisma, async (tx) => {
          const existing = await tx.calendarEventBooking.findFirst({
            where: { intentId: intent.id, userId },
            include: {
              event: true,
              child: { select: { firstName: true, lastName: true } },
            },
          });
          if (existing) return existing;

          const duplicate = await tx.calendarEventBooking.findFirst({
            where: {
              eventId: intent.eventId,
              userId,
              childId: intent.childId ?? null,
              status: { notIn: ['CANCELLED', 'REFUNDED'] },
            },
            include: {
              event: true,
              child: { select: { firstName: true, lastName: true } },
            },
          });
          if (duplicate) return duplicate;

          const bookingReference = await generateBookingReference(tx);
          const resolvedBookingStatus: BookingStatus =
            intent.paymentMethod === 'TAX_FREE_CHILDCARE'
              ? 'GOVERNMENT_PAYMENT_PENDING'
              : 'CONFIRMED';
          const booking = await tx.calendarEventBooking.create({
            data: {
              eventId: intent.eventId,
              userId,
              childId: intent.childId,
              intentId: intent.id,
              notes: intent.medicalNotes,
              medicalNotes: intent.medicalNotes,
              status: resolvedBookingStatus,
              bookingReference,
              fullName: intent.fullName,
              email: intent.email,
              phone: intent.phone,
              paymentMethod: intent.paymentMethod,
              taxFreeChildcareRef: intent.taxFreeChildcareRef,
              stripeCheckoutSessionId: checkoutSessionId,
              stripePaymentIntentId,
              currency: intent.currency,
              subtotal: intent.subtotal,
              addonsTotal: intent.addonsTotal,
              discountTotal: intent.discountTotal,
              serviceFee: intent.serviceFee,
              totalPaid: intent.total,
            },
            include: {
              event: true,
              child: { select: { firstName: true, lastName: true } },
            },
          });
          const receiptUrl = `${env.BASE_URL}/api/v1/bookings/${booking.id}/receipt`;
          const updatedBooking = await tx.calendarEventBooking.update({
            where: { id: booking.id },
            data: { receiptUrl },
            include: {
              event: true,
              child: { select: { firstName: true, lastName: true } },
            },
          });
          await tx.eventBookingIntent.update({
            where: { id: intent.id },
            data: {
              status: 'CONFIRMED',
              currentStep: 'success',
              stripeCheckoutSessionId: checkoutSessionId,
              stripePaymentIntentId,
            },
          });
          return updatedBooking;
        });
      } catch (error) {
        if (!isRetriableConflict(error)) throw error;
        const recovered = await prisma.calendarEventBooking.findFirst({
          where: { intentId: intent.id, userId },
          include: {
            event: true,
            child: { select: { firstName: true, lastName: true } },
          },
        });
        if (!recovered) throw error;
        created = recovered;
      }

      await reply.status(200).send({ data: mapConfirmation(created) });
    },
  });

  app.get('/api/v1/bookings/:bookingId/receipt', {
    schema: {
      tags: ['Bookings'],
      summary: 'Download a PDF receipt for an event booking',
      security: [{ BearerAuth: [] }],
    },
    preHandler: [...parentGuard, validate({ params: BookingIdParamSchema })],
    handler: async (request: FastifyRequest<{ Params: { bookingId: string } }>, reply: FastifyReply) => {
      const booking = await prisma.calendarEventBooking.findFirst({
        where: { id: request.params.bookingId, userId: request.user!.id },
        include: {
          event: true,
          child: { select: { firstName: true, lastName: true } },
        },
      });
      if (!booking) throw new AppError('ACCOUNT_NOT_FOUND', 'Booking receipt not found.', 404);

      const pdfBuffer = await generateReceiptPdf({
        bookingReference: booking.bookingReference ?? booking.id,
        eventTitle: booking.event.title,
        venue: booking.event.location,
        dateStart: toDateOnly(getEventStartDate(booking.event)) ?? 'N/A',
        dateEnd: toDateOnly(booking.event.endDate ?? getEventStartDate(booking.event)) ?? 'N/A',
        attendee: booking.child ? `${booking.child.firstName} ${booking.child.lastName}` : 'N/A',
        contact: booking.fullName ?? 'N/A',
        email: booking.email ?? 'N/A',
        phone: booking.phone ?? 'N/A',
        paymentMethod: booking.paymentMethod?.toLowerCase() ?? 'N/A',
        totalPaid: `${booking.currency} ${toNumber(booking.totalPaid).toFixed(2)}`,
      });

      await reply
        .header('Content-Type', 'application/pdf')
        .header(
          'Content-Disposition',
          `attachment; filename="event-booking-${booking.bookingReference ?? booking.id}.pdf"`,
        )
        .send(pdfBuffer);
    },
  });
}

export default fp(eventBookingsRoutes, { name: 'event-bookings-routes' });
