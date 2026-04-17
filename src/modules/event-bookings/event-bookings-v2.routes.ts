/**
 * @file event-bookings-v2.routes.ts
 * @description V2 cart-style event booking flow.
 *   Supports: single booking, single-day multi-slot, multi-day, and multi-event bookings.
 *   Flow: create intent → add items → contact → payment → confirm.
 * @module src/modules/event-bookings/event-bookings-v2.routes
 */
import { createHash } from 'node:crypto';

import { Prisma } from '@prisma/client';
import type {
  BookingStatus,
  CalendarEventBookingItem,
  CalendarEventSlot,
  EventBookingIntentItem,
  EventPaymentMethod,
  PrismaClient,
} from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import PDFDocument from 'pdfkit';
import { z } from 'zod';

import { env } from '@/config/env.js';
import { assertAgeEligible } from '@/shared/domain/invariants/assertAgeEligible.js';
import { AppError } from '@/shared/errors/AppError.js';
import { prisma } from '@/shared/infrastructure/prisma.js';
import { authMiddleware } from '@/shared/middleware/auth.middleware.js';
import { requireRole } from '@/shared/middleware/rbac.middleware.js';
import { validate } from '@/shared/middleware/validate.js';
import { getStripeClient } from '@/shared/utils/stripe.js';
import { withTransaction } from '@/shared/utils/transaction.js';

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

type SelectedAddon = { code: string; selected: boolean };
type EventAddon = { code: string; label: string; price: number; defaultSelected?: boolean };

const parentGuard = [authMiddleware, requireRole('PARENT')];

// ─── Schemas ──────────────────────────────────────────────────────────────────

const IntentIdParam = z.object({ intentId: z.string().min(1) });
const ItemIdParam = z.object({ intentId: z.string().min(1), itemId: z.string().min(1) });
const BookingIdParam = z.object({ bookingId: z.string().min(1) });

const AddItemSchema = z.object({
  slotId: z.string().min(1),
  childId: z.string().min(1).optional(),
  medicalNotes: z.string().max(2000).optional(),
  addons: z
    .array(z.object({ code: z.string().min(1), selected: z.boolean() }))
    .default([]),
});

const UpdateItemSchema = z.object({
  childId: z.string().min(1).optional(),
  medicalNotes: z.string().max(2000).optional(),
  addons: z
    .array(z.object({ code: z.string().min(1), selected: z.boolean() }))
    .optional(),
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

const ConfirmSchema = z.object({
  checkoutSessionId: z.string().min(1).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

function toDateOnly(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString().split('T')[0] : undefined;
}

function parseAddons(value: Prisma.JsonValue | null | undefined): EventAddon[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const code = typeof item.code === 'string' ? item.code : undefined;
    const label = typeof item.label === 'string' ? item.label : undefined;
    const price = typeof item.price === 'number' ? item.price : undefined;
    if (!code || !label || price === undefined) return [];
    return [{ code, label, price, defaultSelected: typeof item.defaultSelected === 'boolean' ? item.defaultSelected : false }];
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

function computeLineTotals(
  slot: { price: Prisma.Decimal | number; serviceFee: Prisma.Decimal | number },
  eventAddons: EventAddon[],
  selectedAddons: SelectedAddon[],
) {
  const selectedCodes = new Set(selectedAddons.filter((a) => a.selected).map((a) => a.code));
  const lineAddonsTotal = eventAddons
    .filter((a) => selectedCodes.has(a.code))
    .reduce((sum, a) => sum + a.price, 0);
  const lineSubtotal = toNum(slot.price);
  const lineServiceFee = toNum(slot.serviceFee);
  const lineTotal = Number((lineSubtotal + lineAddonsTotal + lineServiceFee).toFixed(2));
  return { lineSubtotal, lineAddonsTotal, lineServiceFee, lineTotal };
}

function computeCartSummary(
  currency: string,
  items: Pick<EventBookingIntentItem, 'lineSubtotal' | 'lineAddonsTotal' | 'lineServiceFee' | 'lineTotal'>[],
) {
  const subtotal = Number(items.reduce((s, i) => s + toNum(i.lineSubtotal), 0).toFixed(2));
  const addonsTotal = Number(items.reduce((s, i) => s + toNum(i.lineAddonsTotal), 0).toFixed(2));
  const serviceFee = Number(items.reduce((s, i) => s + toNum(i.lineServiceFee), 0).toFixed(2));
  const discountTotal = 0;
  const total = Number((subtotal + addonsTotal + serviceFee - discountTotal).toFixed(2));
  return { currency, subtotal, addonsTotal, discountTotal, serviceFee, total };
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

function buildCheckoutFingerprint(args: {
  intentId: string;
  currency: string;
  totalMinor: number;
  successUrl: string;
  cancelUrl: string;
  itemIds: string[];
}): string {
  const payload = JSON.stringify({
    intentId: args.intentId,
    currency: args.currency,
    totalMinor: args.totalMinor,
    successUrl: args.successUrl,
    cancelUrl: args.cancelUrl,
    itemIds: [...args.itemIds].sort(),
  });
  return createHash('sha256').update(payload).digest('hex');
}

function normalizeCheckoutSessionId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  const isPlaceholder =
    (normalized.startsWith('{') && normalized.endsWith('}')) ||
    /CHECKOUT_SESSION_ID/i.test(normalized);
  return isPlaceholder ? undefined : normalized;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

type FullIntentItem = EventBookingIntentItem & {
  slot: CalendarEventSlot & {
    eventDate: {
      id: string;
      date: Date;
      event: {
        id: string;
        title: string;
        currency: string;
        addons: Prisma.JsonValue | null;
        minAgeYears: number | null;
        maxAgeYears: number | null;
      };
    };
  };
  child: { id: string; firstName: string; lastName: string } | null;
};

function mapIntentItem(item: FullIntentItem) {
  return {
    itemId: item.id,
    slotId: item.slotId,
    slot: {
      startTime: item.slot.startTime,
      endTime: item.slot.endTime,
      price: toNum(item.slot.price),
      serviceFee: toNum(item.slot.serviceFee),
    },
    date: toDateOnly(item.slot.eventDate.date),
    event: {
      id: item.slot.eventDate.event.id,
      title: item.slot.eventDate.event.title,
    },
    child: item.child
      ? { id: item.child.id, name: `${item.child.firstName} ${item.child.lastName}` }
      : undefined,
    medicalNotes: item.medicalNotes ?? undefined,
    addons: parseSelectedAddons(item.addons),
    lineTotals: {
      subtotal: toNum(item.lineSubtotal),
      addonsTotal: toNum(item.lineAddonsTotal),
      serviceFee: toNum(item.lineServiceFee),
      total: toNum(item.lineTotal),
    },
  };
}

type IntentWithItems = {
  id: string;
  status: string;
  currentStep: string;
  expiresAt: Date;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  paymentMethod: EventPaymentMethod | null;
  stripeCheckoutUrl: string | null;
  stripeCheckoutFingerprint: string | null;
  currency: string;
  subtotal: Prisma.Decimal;
  addonsTotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  serviceFee: Prisma.Decimal;
  total: Prisma.Decimal;
  items: FullIntentItem[];
};

function mapIntent(intent: IntentWithItems) {
  return {
    intentId: intent.id,
    status: intent.status.toLowerCase(),
    currentStep: intent.currentStep,
    expiresAt: intent.expiresAt.toISOString(),
    items: intent.items.map(mapIntentItem),
    ...(intent.fullName || intent.email || intent.phone
      ? {
          contact: {
            fullName: intent.fullName ?? undefined,
            email: intent.email ?? undefined,
            phone: intent.phone ?? undefined,
          },
        }
      : {}),
    ...(intent.paymentMethod || intent.stripeCheckoutUrl
      ? {
          payment: {
            method: intent.paymentMethod?.toLowerCase(),
            checkoutUrl: intent.stripeCheckoutUrl ?? undefined,
          },
        }
      : {}),
    summary: computeCartSummary(intent.currency, intent.items),
  };
}

type FullBookingItem = CalendarEventBookingItem & {
  slot: { startTime: string; endTime: string; eventDate: { date: Date } };
  child: { firstName: string; lastName: string } | null;
};

function mapBookingConfirmation(booking: {
  id: string;
  bookingReference: string | null;
  status: BookingStatus;
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
  items: FullBookingItem[];
}) {
  const statusMap: Record<BookingStatus, string> = {
    PENDING: 'pending_payment',
    PENDING_PAYMENT: 'pending_payment',
    GOVERNMENT_PAYMENT_PENDING: 'government_payment_pending',
    CONFIRMED: 'confirmed',
    REFUNDED: 'refunded',
    CANCELLED: 'cancelled',
  };
  return {
    bookingId: booking.id,
    bookingReference: booking.bookingReference ?? booking.id.toUpperCase().slice(0, 8),
    status: statusMap[booking.status],
    contact: {
      fullName: booking.fullName ?? undefined,
      email: booking.email ?? undefined,
      phone: booking.phone ?? undefined,
    },
    items: booking.items.map((item) => ({
      itemId: item.id,
      slotId: item.slotId,
      eventId: item.eventId,
      date: toDateOnly(item.slot.eventDate.date),
      slot: { startTime: item.slot.startTime, endTime: item.slot.endTime },
      child: item.child
        ? { name: `${item.child.firstName} ${item.child.lastName}` }
        : undefined,
      lineTotals: {
        subtotal: toNum(item.lineSubtotal),
        addonsTotal: toNum(item.lineAddonsTotal),
        serviceFee: toNum(item.lineServiceFee),
        total: toNum(item.lineTotal),
      },
    })),
    payment: {
      method: booking.paymentMethod?.toLowerCase() ?? undefined,
      currency: booking.currency,
      subtotal: toNum(booking.subtotal),
      addonsTotal: toNum(booking.addonsTotal),
      discountTotal: toNum(booking.discountTotal),
      serviceFee: toNum(booking.serviceFee),
      totalPaid: toNum(booking.totalPaid),
    },
    receipt: {
      downloadUrl: booking.receiptUrl ?? `${env.BASE_URL}/api/v2/bookings/${booking.id}/receipt`,
    },
  };
}

// ─── Shared intent loader ─────────────────────────────────────────────────────

const intentItemInclude = {
  slot: {
    include: {
      eventDate: {
        include: {
          event: {
            select: { id: true, title: true, currency: true, addons: true, minAgeYears: true, maxAgeYears: true },
          },
        },
      },
    },
  },
  child: { select: { id: true, firstName: true, lastName: true } },
} as const;

async function loadActiveIntent(intentId: string, userId: string) {
  const intent = await prisma.eventBookingIntent.findFirst({
    where: { id: intentId, userId },
    include: { items: { include: intentItemInclude } },
  });

  if (!intent) throw new AppError('ACCOUNT_NOT_FOUND', 'Booking intent not found.', 404);

  if (
    intent.status !== 'CONFIRMED' &&
    intent.status !== 'CANCELLED' &&
    intent.expiresAt < new Date()
  ) {
    await prisma.eventBookingIntent.update({
      where: { id: intent.id },
      data: { status: 'EXPIRED', currentStep: 'expired' },
    });
    throw new AppError('INTENT_EXPIRED', 'Booking intent has expired.', 409);
  }

  return intent as typeof intent & { items: FullIntentItem[] };
}

async function syncIntentTotals(intentId: string, items: FullIntentItem[], currency: string) {
  const summary = computeCartSummary(currency, items);
  await prisma.eventBookingIntent.update({
    where: { id: intentId },
    data: {
      currency: summary.currency,
      subtotal: summary.subtotal,
      addonsTotal: summary.addonsTotal,
      discountTotal: summary.discountTotal,
      serviceFee: summary.serviceFee,
      total: summary.total,
    },
  });
}

async function clearStripeSession(intentId: string): Promise<void> {
  await prisma.eventBookingIntent.update({
    where: { id: intentId },
    data: {
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      stripeCheckoutUrl: null,
      stripeCheckoutFingerprint: null,
      // Walk status back so the client knows payment must be re-selected.
      status: 'CONTACT_COMPLETED',
      currentStep: 'payment',
    },
  });
}

async function generateBookingRef(tx: TxClient): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const candidate = `EVT${Math.random().toString().slice(2, 8)}`;
    const existing = await tx.calendarEventBooking.findUnique({
      where: { bookingReference: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new AppError('SERVER_ERROR', 'Unable to generate booking reference.', 500);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

async function eventBookingsV2Routes(app: FastifyInstance): Promise<void> {
  // ─── POST /api/v2/bookings/intents ────────────────────────────────────────
  app.post('/api/v2/bookings/intents', {
    schema: {
      tags: ['Event Bookings'],
      summary: '[V2] Create a new cart-style booking intent',
      security: [{ BearerAuth: [] }],
    },
    preHandler: parentGuard,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      // Return any unexpired draft intent
      const existing = await prisma.eventBookingIntent.findFirst({
        where: {
          userId,
          eventId: null,
          status: { in: ['DRAFT', 'ATTENDEE_COMPLETED', 'CONTACT_COMPLETED', 'PAYMENT_SELECTED'] },
          expiresAt: { gt: new Date() },
        },
        include: { items: { include: intentItemInclude } },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        await reply.status(200).send({ data: mapIntent(existing as typeof existing & { items: FullIntentItem[] }) });
        return;
      }

      const intent = await prisma.eventBookingIntent.create({
        data: {
          userId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour for cart
          currentStep: 'items',
          currency: 'GBP',
        },
        include: { items: { include: intentItemInclude } },
      });

      await reply.status(201).send({ data: mapIntent(intent as typeof intent & { items: FullIntentItem[] }) });
    },
  });

  // ─── GET /api/v2/bookings/intents/:intentId ───────────────────────────────
  app.get('/api/v2/bookings/intents/:intentId', {
    schema: {
      tags: ['Event Bookings'],
      summary: '[V2] Get cart intent with all items',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { intentId: { type: 'string' } } },
    },
    preHandler: [...parentGuard, validate({ params: IntentIdParam })],
    handler: async (
      request: FastifyRequest<{ Params: { intentId: string } }>,
      reply: FastifyReply,
    ) => {
      const intent = await loadActiveIntent(request.params.intentId, request.user!.id);
      await reply.status(200).send({ data: mapIntent(intent) });
    },
  });

  // ─── POST /api/v2/bookings/intents/:intentId/items ────────────────────────
  app.post('/api/v2/bookings/intents/:intentId/items', {
    schema: {
      tags: ['Event Bookings'],
      summary: '[V2] Add a slot to the booking cart',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { intentId: { type: 'string' } } },
    },
    preHandler: [...parentGuard, validate({ params: IntentIdParam, body: AddItemSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: { intentId: string };
        Body: z.infer<typeof AddItemSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user!.id;
      const intent = await loadActiveIntent(request.params.intentId, userId);
      const { slotId, childId, medicalNotes, addons } = request.body;

      // Load slot with full event context
      const slot = await prisma.calendarEventSlot.findFirst({
        where: { id: slotId, isActive: true },
        include: {
          eventDate: {
            include: {
              event: { select: { id: true, title: true, currency: true, addons: true, minAgeYears: true, maxAgeYears: true } },
            },
          },
        },
      });
      if (!slot) throw new AppError('ACCOUNT_NOT_FOUND', 'Slot not found or not active.', 404);
      if (slot.eventDate.isClosed) {
        throw new AppError('VALIDATION_ERROR', 'This event date is closed for bookings.', 409);
      }

      // Keep cart currency consistent across all selected items.
      const intentCurrency = intent.items[0]?.slot.eventDate.event.currency ?? intent.currency;
      if (intent.items.length > 0 && slot.eventDate.event.currency !== intentCurrency) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Cannot mix currencies in one booking cart (${intentCurrency} vs ${slot.eventDate.event.currency}).`,
          409,
        );
      }

      // Validate child ownership and age eligibility
      if (childId) {
        const child = await prisma.child.findFirst({ where: { id: childId, userId } });
        if (!child) throw new AppError('ACCOUNT_NOT_FOUND', 'Child not found.', 404);

        const minAge = slot.minAgeYears ?? slot.eventDate.event.minAgeYears ?? null;
        const maxAge = slot.maxAgeYears ?? slot.eventDate.event.maxAgeYears ?? null;
        if (minAge !== null && maxAge !== null) {
          assertAgeEligible(child, {
            date: slot.eventDate.date,
            minAgeYears: minAge,
            maxAgeYears: maxAge,
          });
        }
      }

      // Prevent duplicate slot+child combination in same intent
      const duplicate = intent.items.find(
        (i) => i.slotId === slotId && (i.childId ?? null) === (childId ?? null),
      );
      if (duplicate) {
        throw new AppError('VALIDATION_ERROR', 'This slot is already in the cart for this child.', 409);
      }

      const eventAddons = parseAddons(slot.eventDate.event.addons);
      const lineTotals = computeLineTotals(slot, eventAddons, addons);

      const newItem = await prisma.eventBookingIntentItem.create({
        data: {
          intentId: intent.id,
          slotId,
          childId,
          medicalNotes,
          addons: addons as unknown as Prisma.InputJsonValue,
          ...lineTotals,
        },
        include: intentItemInclude,
      });

      const updatedItems = [...intent.items, newItem as unknown as FullIntentItem];
      const currency = slot.eventDate.event.currency;
      await syncIntentTotals(intent.id, updatedItems, currency);

      // Cart changed — any existing Stripe session is now stale.
      if (intent.stripeCheckoutSessionId) {
        await clearStripeSession(intent.id);
      }

      // Refresh intent for response
      const updated = await loadActiveIntent(intent.id, userId);
      await reply.status(201).send({ data: mapIntent(updated) });
    },
  });

  // ─── PATCH /api/v2/bookings/intents/:intentId/items/:itemId ──────────────
  app.patch('/api/v2/bookings/intents/:intentId/items/:itemId', {
    schema: {
      tags: ['Event Bookings'],
      summary: '[V2] Update child or addons on a cart item',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { intentId: { type: 'string' }, itemId: { type: 'string' } },
      },
    },
    preHandler: [...parentGuard, validate({ params: ItemIdParam, body: UpdateItemSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: { intentId: string; itemId: string };
        Body: z.infer<typeof UpdateItemSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user!.id;
      const intent = await loadActiveIntent(request.params.intentId, userId);
      const item = intent.items.find((i) => i.id === request.params.itemId);
      if (!item) throw new AppError('ACCOUNT_NOT_FOUND', 'Cart item not found.', 404);

      const { childId, medicalNotes, addons } = request.body;

      if (childId) {
        const child = await prisma.child.findFirst({ where: { id: childId, userId } });
        if (!child) throw new AppError('ACCOUNT_NOT_FOUND', 'Child not found.', 404);

        const minAge = item.slot.minAgeYears ?? item.slot.eventDate.event.minAgeYears ?? null;
        const maxAge = item.slot.maxAgeYears ?? item.slot.eventDate.event.maxAgeYears ?? null;
        if (minAge !== null && maxAge !== null) {
          assertAgeEligible(child, {
            date: item.slot.eventDate.date,
            minAgeYears: minAge as number,
            maxAgeYears: maxAge as number,
          });
        }
      }

      const effectiveAddons = addons ?? parseSelectedAddons(item.addons);
      const eventAddons = parseAddons(item.slot.eventDate.event.addons);
      const lineTotals = computeLineTotals(item.slot, eventAddons, effectiveAddons);

      await prisma.eventBookingIntentItem.update({
        where: { id: item.id },
        data: {
          ...(childId !== undefined ? { childId } : {}),
          ...(medicalNotes !== undefined ? { medicalNotes } : {}),
          ...(addons !== undefined ? { addons: addons as unknown as Prisma.InputJsonValue } : {}),
          ...lineTotals,
        },
      });

      const updated = await loadActiveIntent(intent.id, userId);
      await syncIntentTotals(intent.id, updated.items, intent.currency);

      // Cart changed — any existing Stripe session is now stale.
      if (intent.stripeCheckoutSessionId) {
        await clearStripeSession(intent.id);
      }

      const refreshed = await loadActiveIntent(intent.id, userId);
      await reply.status(200).send({ data: mapIntent(refreshed) });
    },
  });

  // ─── DELETE /api/v2/bookings/intents/:intentId/items/:itemId ─────────────
  app.delete('/api/v2/bookings/intents/:intentId/items/:itemId', {
    schema: {
      tags: ['Event Bookings'],
      summary: '[V2] Remove a slot from the booking cart',
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        properties: { intentId: { type: 'string' }, itemId: { type: 'string' } },
      },
    },
    preHandler: [...parentGuard, validate({ params: ItemIdParam })],
    handler: async (
      request: FastifyRequest<{ Params: { intentId: string; itemId: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user!.id;
      const intent = await loadActiveIntent(request.params.intentId, userId);
      const item = intent.items.find((i) => i.id === request.params.itemId);
      if (!item) throw new AppError('ACCOUNT_NOT_FOUND', 'Cart item not found.', 404);

      await prisma.eventBookingIntentItem.delete({ where: { id: item.id } });

      const remaining = intent.items.filter((i) => i.id !== item.id);
      await syncIntentTotals(intent.id, remaining, intent.currency);

      // Cart changed — any existing Stripe session is now stale.
      if (intent.stripeCheckoutSessionId) {
        await clearStripeSession(intent.id);
      }

      const updated = await loadActiveIntent(intent.id, userId);
      await reply.status(200).send({ data: mapIntent(updated) });
    },
  });

  // ─── PATCH /api/v2/bookings/intents/:intentId/contact ────────────────────
  app.patch('/api/v2/bookings/intents/:intentId/contact', {
    schema: {
      tags: ['Event Bookings'],
      summary: '[V2] Save contact details for the booking',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { intentId: { type: 'string' } } },
    },
    preHandler: [...parentGuard, validate({ params: IntentIdParam, body: ContactSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: { intentId: string };
        Body: z.infer<typeof ContactSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user!.id;
      const intent = await loadActiveIntent(request.params.intentId, userId);

      if (intent.items.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Add at least one slot before saving contact details.', 422);
      }

      await prisma.eventBookingIntent.update({
        where: { id: intent.id },
        data: {
          fullName: request.body.fullName,
          email: request.body.email,
          phone: request.body.phone,
          status: 'CONTACT_COMPLETED',
          currentStep: 'payment',
        },
      });

      const updated = await loadActiveIntent(intent.id, userId);
      await reply.status(200).send({ data: mapIntent(updated) });
    },
  });

  // ─── PATCH /api/v2/bookings/intents/:intentId/payment ────────────────────
  app.patch('/api/v2/bookings/intents/:intentId/payment', {
    schema: {
      tags: ['Event Bookings'],
      summary: '[V2] Select payment method for the booking',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { intentId: { type: 'string' } } },
    },
    preHandler: [...parentGuard, validate({ params: IntentIdParam, body: PaymentSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: { intentId: string };
        Body: z.infer<typeof PaymentSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user!.id;
      const intent = await loadActiveIntent(request.params.intentId, userId);

      if (intent.items.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Cart is empty.', 422);
      }
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
        const frontendBase = env.CORS_ORIGIN.split(',')[0]?.trim().replace(/\/+$/, '') || env.BASE_URL;
        const successUrl = request.body.successUrl ?? `${frontendBase}/events/checkout/success`;
        const cancelUrl = request.body.cancelUrl ?? `${frontendBase}/events/checkout/cancel`;
        const totalMinor = Math.round(toNum(intent.total) * 100);

        const fingerprint = buildCheckoutFingerprint({
          intentId: intent.id,
          currency: intent.currency.toLowerCase(),
          totalMinor,
          successUrl,
          cancelUrl,
          itemIds: intent.items.map((i) => i.id),
        });

        // Short-circuit: same cart + same urls → reuse the existing Stripe session.
        if (
          intent.paymentMethod === 'STRIPE' &&
          intent.stripeCheckoutUrl &&
          intent.stripeCheckoutFingerprint === fingerprint
        ) {
          await reply.status(200).send({ data: mapIntent(intent) });
          return;
        }

        const stripe = getStripeClient();
        const eventTitles = [...new Set(intent.items.map((i) => i.slot.eventDate.event.title))].join(', ');

        const session = await stripe.checkout.sessions.create(
          {
            mode: 'payment',
            success_url: successUrl,
            cancel_url: cancelUrl,
            client_reference_id: intent.id,
            customer_email: intent.email ?? request.user!.email,
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: intent.currency.toLowerCase(),
                  unit_amount: totalMinor,
                  product_data: {
                    name: eventTitles || 'Event Booking',
                    description: `${intent.items.length} slot(s)`,
                  },
                },
              },
            ],
            metadata: { intentId: intent.id, userId },
            payment_intent_data: { metadata: { intentId: intent.id, userId } },
          },
          { idempotencyKey: `v2-intent-${intent.id}-${fingerprint.slice(0, 24)}` },
        );

        paymentMethod = 'STRIPE';
        stripeCheckoutSessionId = session.id;
        stripeCheckoutUrl = session.url ?? undefined;
        stripePaymentIntentId =
          typeof session.payment_intent === 'string' ? session.payment_intent : undefined;

        await prisma.eventBookingIntent.update({
          where: { id: intent.id },
          data: {
            paymentMethod: 'STRIPE',
            stripeCheckoutSessionId,
            stripeCheckoutUrl: stripeCheckoutUrl ?? null,
            stripePaymentIntentId: stripePaymentIntentId ?? null,
            stripeCheckoutFingerprint: fingerprint,
            status: 'PAYMENT_SELECTED',
            currentStep: 'payment',
          },
        });

        const updated = await loadActiveIntent(intent.id, userId);
        await reply.status(200).send({ data: mapIntent(updated) });
        return;
      } else if (request.body.method === 'tax_free_childcare') {
        paymentMethod = 'TAX_FREE_CHILDCARE';
        paymentProvider = 'hmrc';
        taxFreeChildcareRef = request.body.taxFreeChildcareRef;
      } else {
        paymentMethod = 'CARD';
        paymentProvider = request.body.provider;
      }

      await prisma.eventBookingIntent.update({
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
      });

      const updated = await loadActiveIntent(intent.id, userId);
      await reply.status(200).send({ data: mapIntent(updated) });
    },
  });

  // ─── POST /api/v2/bookings/intents/:intentId/confirm ─────────────────────
  app.post('/api/v2/bookings/intents/:intentId/confirm', {
    schema: {
      tags: ['Event Bookings'],
      summary: '[V2] Confirm the cart and create bookings for all items',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { intentId: { type: 'string' } } },
    },
    preHandler: [...parentGuard, validate({ params: IntentIdParam, body: ConfirmSchema })],
    handler: async (
      request: FastifyRequest<{
        Params: { intentId: string };
        Body: z.infer<typeof ConfirmSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user!.id;

      const intent = await prisma.eventBookingIntent.findFirst({
        where: { id: request.params.intentId, userId },
        include: {
          items: { include: intentItemInclude },
          booking: {
            include: {
              items: {
                include: {
                  slot: {
                    select: { startTime: true, endTime: true, eventDate: { select: { date: true } } },
                  },
                  child: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      });

      if (!intent) throw new AppError('ACCOUNT_NOT_FOUND', 'Booking intent not found.', 404);

      // Already confirmed — return existing booking
      if (intent.booking) {
        await reply.status(200).send({ data: mapBookingConfirmation(intent.booking) });
        return;
      }

      if (intent.expiresAt < new Date()) {
        await prisma.eventBookingIntent.update({
          where: { id: intent.id },
          data: { status: 'EXPIRED', currentStep: 'expired' },
        });
        throw new AppError('INTENT_EXPIRED', 'Booking intent has expired.', 409);
      }

      if (intent.items.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Cannot confirm an empty cart.', 422);
      }
      if (!intent.fullName || !intent.email || !intent.phone) {
        throw new AppError('VALIDATION_ERROR', 'Contact step must be completed first.', 422);
      }
      if (!intent.paymentMethod) {
        throw new AppError('VALIDATION_ERROR', 'Payment step must be completed first.', 422);
      }

      // Stripe: verify payment
      let checkoutSessionId = intent.stripeCheckoutSessionId ?? undefined;
      let stripePaymentIntentId = intent.stripePaymentIntentId ?? undefined;

      if (intent.paymentMethod === 'STRIPE') {
        const requestedId = normalizeCheckoutSessionId(request.body.checkoutSessionId);
        checkoutSessionId = requestedId ?? checkoutSessionId;
        if (!checkoutSessionId) {
          throw new AppError('VALIDATION_ERROR', 'A valid checkoutSessionId is required for Stripe.', 422);
        }
        const stripe = getStripeClient();
        const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
          expand: ['payment_intent'],
        });
        if (session.client_reference_id !== intent.id) {
          throw new AppError('VALIDATION_ERROR', 'Stripe session does not match this booking intent.', 409);
        }
        if (session.payment_status !== 'paid') {
          throw new AppError('VALIDATION_ERROR', 'Stripe checkout has not been paid.', 409);
        }
        stripePaymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;
      }

      let booking;
      try {
        booking = await withTransaction(prisma, async (tx) => {
          // Idempotency: return existing if already created
          const existing = await tx.calendarEventBooking.findFirst({
            where: { intentId: intent.id, userId },
            include: {
              items: {
                include: {
                  slot: {
                    select: { startTime: true, endTime: true, eventDate: { select: { date: true } } },
                  },
                  child: { select: { firstName: true, lastName: true } },
                },
              },
            },
          });
          if (existing) return existing;

          // ── Per-slot capacity checks ──────────────────────────────
          for (const item of intent.items as FullIntentItem[]) {
            // Lock the slot row
            const slot = await tx.calendarEventSlot.findUnique({
              where: { id: item.slotId },
              select: { id: true, capacity: true, bookedCount: true, isActive: true },
            });
            if (!slot || !slot.isActive) {
              throw new AppError('VALIDATION_ERROR', `Slot is no longer available.`, 409);
            }
            if (slot.bookedCount >= slot.capacity) {
              throw new AppError('EVENT_FULL', `A selected slot is fully booked.`, 409);
            }

            // Duplicate booking guard for confirmed bookings
            if (item.childId) {
              const dupe = await tx.calendarEventBookingItem.findFirst({
                where: {
                  slotId: item.slotId,
                  childId: item.childId,
                  booking: { status: { notIn: ['CANCELLED', 'REFUNDED'] } },
                },
                select: { id: true },
              });
              if (dupe) {
                throw new AppError(
                  'VALIDATION_ERROR',
                  `This child already has an active booking for one of the selected slots.`,
                  409,
                );
              }
            }
          }

          const resolvedStatus: BookingStatus =
            intent.paymentMethod === 'TAX_FREE_CHILDCARE' ? 'GOVERNMENT_PAYMENT_PENDING' : 'CONFIRMED';

          const bookingReference = await generateBookingRef(tx);

          const cartSummary = computeCartSummary(
            intent.currency,
            intent.items as FullIntentItem[],
          );

          const created = await tx.calendarEventBooking.create({
            data: {
              userId,
              intentId: intent.id,
              status: resolvedStatus,
              bookingReference,
              fullName: intent.fullName,
              email: intent.email,
              phone: intent.phone,
              paymentMethod: intent.paymentMethod,
              taxFreeChildcareRef: intent.taxFreeChildcareRef,
              stripeCheckoutSessionId: checkoutSessionId,
              stripePaymentIntentId,
              currency: cartSummary.currency,
              subtotal: cartSummary.subtotal,
              addonsTotal: cartSummary.addonsTotal,
              discountTotal: cartSummary.discountTotal,
              serviceFee: cartSummary.serviceFee,
              totalPaid: cartSummary.total,
              receiptUrl: null,
              items: {
                create: (intent.items as FullIntentItem[]).map((item) => ({
                  slotId: item.slotId,
                  eventId: item.slot.eventDate.event.id,
                  eventDateId: item.slot.eventDateId,
                  childId: item.childId,
                  medicalNotes: item.medicalNotes,
                  addons: item.addons ?? Prisma.JsonNull,
                  lineSubtotal: toNum(item.lineSubtotal),
                  lineAddonsTotal: toNum(item.lineAddonsTotal),
                  lineServiceFee: toNum(item.lineServiceFee),
                  lineTotal: toNum(item.lineTotal),
                })),
              },
            },
            include: {
              items: {
                include: {
                  slot: {
                    select: { startTime: true, endTime: true, eventDate: { select: { date: true } } },
                  },
                  child: { select: { firstName: true, lastName: true } },
                },
              },
            },
          });

          // Increment bookedCount per slot
          for (const item of intent.items as FullIntentItem[]) {
            await tx.calendarEventSlot.update({
              where: { id: item.slotId },
              data: { bookedCount: { increment: 1 } },
            });
          }

          const receiptUrl = `${env.BASE_URL}/api/v2/bookings/${created.id}/receipt`;
          const withReceipt = await tx.calendarEventBooking.update({
            where: { id: created.id },
            data: { receiptUrl },
            include: {
              items: {
                include: {
                  slot: {
                    select: { startTime: true, endTime: true, eventDate: { select: { date: true } } },
                  },
                  child: { select: { firstName: true, lastName: true } },
                },
              },
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

          return withReceipt;
        });
      } catch (error) {
        if (!isRetriableConflict(error)) throw error;
        const recovered = await prisma.calendarEventBooking.findFirst({
          where: { intentId: intent.id, userId },
          include: {
            items: {
              include: {
                slot: {
                  select: { startTime: true, endTime: true, eventDate: { select: { date: true } } },
                },
                child: { select: { firstName: true, lastName: true } },
              },
            },
          },
        });
        if (!recovered) throw error;
        booking = recovered;
      }

      await reply.status(200).send({ data: mapBookingConfirmation(booking) });
    },
  });

  // ─── GET /api/v2/bookings/mine ────────────────────────────────────────────
  app.get('/api/v2/bookings/mine', {
    schema: {
      tags: ['Event Bookings'],
      summary: '[V2] List current user bookings with all booked items',
      security: [{ BearerAuth: [] }],
    },
    preHandler: parentGuard,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const bookings = await prisma.calendarEventBooking.findMany({
        where: { userId: request.user!.id },
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              slot: {
                include: {
                  eventDate: {
                    include: { event: { select: { id: true, title: true, location: true } } },
                  },
                },
              },
              child: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      const statusMap: Record<BookingStatus, string> = {
        PENDING: 'pending_payment',
        PENDING_PAYMENT: 'pending_payment',
        GOVERNMENT_PAYMENT_PENDING: 'government_payment_pending',
        CONFIRMED: 'confirmed',
        REFUNDED: 'refunded',
        CANCELLED: 'cancelled',
      };

      await reply.status(200).send({
        data: bookings.map((b) => ({
          bookingId: b.id,
          bookingReference: b.bookingReference ?? b.id.toUpperCase().slice(0, 8),
          status: statusMap[b.status],
          createdAt: b.createdAt.toISOString(),
          payment: {
            currency: b.currency,
            totalPaid: toNum(b.totalPaid),
          },
          items: b.items.map((item) => ({
            itemId: item.id,
            event: item.slot.eventDate.event,
            date: toDateOnly(item.slot.eventDate.date),
            slot: { startTime: item.slot.startTime, endTime: item.slot.endTime },
            child: item.child
              ? { name: `${item.child.firstName} ${item.child.lastName}` }
              : undefined,
            lineTotal: toNum(item.lineTotal),
          })),
          receipt: {
            downloadUrl: b.receiptUrl ?? `${env.BASE_URL}/api/v2/bookings/${b.id}/receipt`,
          },
        })),
      });
    },
  });

  // ─── GET /api/v2/bookings/:bookingId/receipt ──────────────────────────────
  app.get('/api/v2/bookings/:bookingId/receipt', {
    schema: {
      tags: ['Event Bookings'],
      summary: '[V2] Download a PDF receipt for a booking',
      security: [{ BearerAuth: [] }],
      params: { type: 'object', properties: { bookingId: { type: 'string' } } },
    },
    preHandler: [...parentGuard, validate({ params: BookingIdParam })],
    handler: async (
      request: FastifyRequest<{ Params: { bookingId: string } }>,
      reply: FastifyReply,
    ) => {
      const booking = await prisma.calendarEventBooking.findFirst({
        where: { id: request.params.bookingId, userId: request.user!.id },
        include: {
          items: {
            include: {
              slot: {
                include: {
                  eventDate: {
                    include: { event: { select: { title: true, location: true } } },
                  },
                },
              },
              child: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      if (!booking) throw new AppError('ACCOUNT_NOT_FOUND', 'Booking not found.', 404);

      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const doc = new PDFDocument({ margin: 50 });
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.fontSize(22).text('DDivine Training', { align: 'right' });
        doc.moveDown(1.5);
        doc.fontSize(18).text('EVENT BOOKING RECEIPT');
        doc.moveDown(0.5);
        doc.fontSize(10);
        doc.text(`Reference: ${booking.bookingReference ?? booking.id}`);
        doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`);
        doc.moveDown();

        doc.fontSize(12).text('Contact');
        doc.fontSize(10);
        doc.text(`Name: ${booking.fullName ?? 'N/A'}`);
        doc.text(`Email: ${booking.email ?? 'N/A'}`);
        doc.text(`Phone: ${booking.phone ?? 'N/A'}`);
        doc.moveDown();

        doc.fontSize(12).text('Booked Slots');
        doc.fontSize(10);
        for (const item of booking.items) {
          const attendee = item.child
            ? `${item.child.firstName} ${item.child.lastName}`
            : 'N/A';
          doc.text(
            `• ${item.slot.eventDate.event.title} — ${toDateOnly(item.slot.eventDate.date) ?? ''} ` +
            `${item.slot.startTime}–${item.slot.endTime} | ${attendee} | ` +
            `${booking.currency} ${toNum(item.lineTotal).toFixed(2)}`,
          );
        }
        doc.moveDown();

        doc.fontSize(12).text('Payment Summary');
        doc.fontSize(10);
        doc.text(`Method: ${booking.paymentMethod?.toLowerCase() ?? 'N/A'}`);
        doc.text(`Subtotal: ${booking.currency} ${toNum(booking.subtotal).toFixed(2)}`);
        doc.text(`Service Fee: ${booking.currency} ${toNum(booking.serviceFee).toFixed(2)}`);
        doc.text(`Total Paid: ${booking.currency} ${toNum(booking.totalPaid).toFixed(2)}`);

        doc.end();
      });

      await reply
        .header('Content-Type', 'application/pdf')
        .header(
          'Content-Disposition',
          `attachment; filename="booking-${booking.bookingReference ?? booking.id}.pdf"`,
        )
        .send(pdfBuffer);
    },
  });
}

export default fp(eventBookingsV2Routes, { name: 'event-bookings-v2-routes' });
