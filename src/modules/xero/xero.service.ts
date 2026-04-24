import { Buffer } from 'node:buffer';

import { env } from '@/config/env.js';
import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/infrastructure/logger.js';

import { xeroRepository } from './xero.repository.js';

interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

interface XeroConnectionItem {
  tenantId: string;
  tenantName: string;
  tenantType: string;
}

const XERO_AUTH_BASE = 'https://login.xero.com';
const XERO_IDENTITY_BASE = 'https://identity.xero.com';
const XERO_API_BASE = 'https://api.xero.com';
const XERO_ACCOUNTING_BASE = 'https://api.xero.com/api.xro/2.0';

function requireXeroConfig() {
  if (!env.XERO_CLIENT_ID || !env.XERO_CLIENT_SECRET || !env.XERO_REDIRECT_URI) {
    throw new AppError('SERVER_ERROR', 'Xero environment variables are not fully configured.', 500);
  }
}

async function getValidConnection() {
  const connection = await xeroRepository.findConnection();
  if (!connection) {
    throw new AppError('VALIDATION_ERROR', 'Xero is not connected yet.', 400);
  }

  const now = Date.now();
  const expiresSoon = connection.expiresAt.getTime() - now < 60_000;
  if (!expiresSoon) {
    return connection;
  }

  const refreshed = await xeroService.refreshToken(connection.refreshToken);
  await xeroRepository.updateTokens({
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    tokenType: refreshed.token_type,
    scope: refreshed.scope,
  });

  const updated = await xeroRepository.findConnection();
  if (!updated) {
    throw new AppError('SERVER_ERROR', 'Xero token refresh failed.', 500);
  }
  return updated;
}

function mapXeroInvoiceStatus(status: string): {
  paymentStatus: 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';
  bookingStatus:
    | 'PENDING'
    | 'PENDING_PAYMENT'
    | 'GOVERNMENT_PAYMENT_PENDING'
    | 'CONFIRMED'
    | 'REFUNDED'
    | 'CANCELLED';
} {
  if (status === 'PAID') {
    return { paymentStatus: 'PAID', bookingStatus: 'CONFIRMED' };
  }
  if (status === 'VOIDED') {
    return { paymentStatus: 'FAILED', bookingStatus: 'CANCELLED' };
  }
  if (status === 'DELETED') {
    return { paymentStatus: 'FAILED', bookingStatus: 'CANCELLED' };
  }
  return { paymentStatus: 'PENDING', bookingStatus: 'GOVERNMENT_PAYMENT_PENDING' };
}

export const xeroService = {
  buildAuthorizeUrl(state: string): string {
    requireXeroConfig();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: env.XERO_CLIENT_ID!,
      redirect_uri: env.XERO_REDIRECT_URI!,
      scope: env.XERO_SCOPES,
      state,
    });

    return `${XERO_AUTH_BASE}/identity/connect/authorize?${params.toString()}`;
  },

  async exchangeCodeForToken(code: string): Promise<XeroTokenResponse> {
    requireXeroConfig();

    const basic = Buffer.from(`${env.XERO_CLIENT_ID!}:${env.XERO_CLIENT_SECRET!}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.XERO_REDIRECT_URI!,
    });

    const response = await fetch(`${XERO_IDENTITY_BASE}/connect/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const details = await response.text();
      logger.error({ details }, 'Xero token exchange failed');
      throw new AppError('SERVER_ERROR', 'Xero token exchange failed.', 502);
    }

    return (await response.json()) as XeroTokenResponse;
  },

  async refreshToken(refreshToken: string): Promise<XeroTokenResponse> {
    requireXeroConfig();

    const basic = Buffer.from(`${env.XERO_CLIENT_ID!}:${env.XERO_CLIENT_SECRET!}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const response = await fetch(`${XERO_IDENTITY_BASE}/connect/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const details = await response.text();
      logger.error({ details }, 'Xero token refresh failed');
      throw new AppError('SERVER_ERROR', 'Xero token refresh failed.', 502);
    }

    return (await response.json()) as XeroTokenResponse;
  },

  async getConnectionsWithAccessToken(accessToken: string): Promise<XeroConnectionItem[]> {
    const response = await fetch(`${XERO_API_BASE}/connections`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const details = await response.text();
      logger.error({ details }, 'Xero connections lookup failed');
      throw new AppError('SERVER_ERROR', 'Failed to fetch Xero tenant connections.', 502);
    }
    return (await response.json()) as XeroConnectionItem[];
  },

  async handleOAuthCallback(code: string) {
    const token = await this.exchangeCodeForToken(code);
    const connections = await this.getConnectionsWithAccessToken(token.access_token);
    const primaryTenant = connections[0];

    if (!primaryTenant) {
      throw new AppError('VALIDATION_ERROR', 'No Xero tenant found for this account.', 400);
    }

    await xeroRepository.saveConnection({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      tokenType: token.token_type,
      scope: token.scope,
      tenantId: primaryTenant.tenantId,
    });

    return {
      tenantId: primaryTenant.tenantId,
      tenantName: primaryTenant.tenantName,
      tenantType: primaryTenant.tenantType,
      expiresIn: token.expires_in,
    };
  },

  async getConnections() {
    const connection = await getValidConnection();
    const items = await this.getConnectionsWithAccessToken(connection.accessToken);
    return items;
  },

  async createInvoiceForBooking(bookingId: string): Promise<void> {
    const booking = await xeroRepository.findBookingForInvoice(bookingId);
    if (!booking) return;
    if (booking.xeroInvoiceId) return;

    const connection = await getValidConnection();

    const ofstedSuffix =
      booking.paymentType === 'GOVERNMENT' ? ' | Ofsted: 2765300' : '';
    const bookingReference = `BK-${booking.id.slice(-8).toUpperCase()}`;
    const description = [
      `Booking Ref: ${bookingReference}`,
      `Service: ${booking.session.service.title}`,
      `Session: ${booking.session.date.toISOString().split('T')[0]} ${booking.session.time}`,
      `Location: ${booking.session.location}`,
      booking.child ? `Child: ${booking.child.firstName} ${booking.child.lastName}` : 'Child: N/A',
      `Parent: ${booking.user.firstName} ${booking.user.lastName}`,
      ofstedSuffix ? `Gov Info${ofstedSuffix}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const payload = {
      Type: 'ACCREC',
      Contact: {
        Name: `${booking.user.firstName} ${booking.user.lastName}`.trim(),
        EmailAddress: booking.user.email,
      },
      Date: new Date().toISOString().split('T')[0],
      DueDate: booking.session.date.toISOString().split('T')[0],
      Reference: `${bookingReference}${ofstedSuffix}`,
      Status: 'AUTHORISED',
      LineItems: [
        {
          Description: description,
          Quantity: 1,
          UnitAmount: booking.price.toNumber(),
          ...(env.XERO_PAYMENT_ACCOUNT_CODE ? { AccountCode: env.XERO_PAYMENT_ACCOUNT_CODE } : {}),
        },
      ],
    };

    const response = await fetch(`${XERO_ACCOUNTING_BASE}/Invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        'Xero-tenant-id': connection.tenantId,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = await response.text();
      logger.error({ bookingId, details }, 'Xero invoice create failed');
      throw new AppError('SERVER_ERROR', 'Failed to create Xero invoice.', 502);
    }

    const data = (await response.json()) as {
      Invoices?: Array<{ InvoiceID: string; Status: string }>;
    };
    const created = data.Invoices?.[0];
    if (!created?.InvoiceID) {
      throw new AppError('SERVER_ERROR', 'Xero did not return an invoice id.', 502);
    }

    await xeroRepository.updateBookingInvoiceLink(booking.id, {
      xeroInvoiceId: created.InvoiceID,
      xeroInvoiceStatus: created.Status ?? 'AUTHORISED',
    });
  },

  async markInvoicePaidForBooking(bookingId: string, amount: number): Promise<void> {
    const booking = await xeroRepository.findBookingById(bookingId);
    if (!booking?.xeroInvoiceId) return;
    if (!env.XERO_PAYMENT_ACCOUNT_CODE) return;

    const connection = await getValidConnection();

    const payload = {
      Payments: [
        {
          Invoice: { InvoiceID: booking.xeroInvoiceId },
          Account: { Code: env.XERO_PAYMENT_ACCOUNT_CODE },
          Date: new Date().toISOString().split('T')[0],
          Amount: amount,
        },
      ],
    };

    const response = await fetch(`${XERO_ACCOUNTING_BASE}/Payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        'Xero-tenant-id': connection.tenantId,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = await response.text();
      logger.error({ bookingId, details }, 'Xero mark-paid failed');
      return;
    }

    await xeroRepository.updateBookingInvoiceLink(booking.id, {
      xeroInvoiceId: booking.xeroInvoiceId,
      xeroInvoiceStatus: 'PAID',
    });
  },

  async syncBookingInvoiceStatus(bookingId: string): Promise<void> {
    const booking = await xeroRepository.findBookingById(bookingId);
    if (!booking?.xeroInvoiceId) return;

    const connection = await getValidConnection();
    const response = await fetch(`${XERO_ACCOUNTING_BASE}/Invoices/${booking.xeroInvoiceId}`, {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        'Xero-tenant-id': connection.tenantId,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const details = await response.text();
      logger.error({ bookingId, details }, 'Xero invoice sync failed');
      return;
    }

    const data = (await response.json()) as { Invoices?: Array<{ Status: string }> };
    const status = data.Invoices?.[0]?.Status;
    if (!status) return;

    const mapped = mapXeroInvoiceStatus(status);
    await xeroRepository.updateBookingFromXeroStatus(booking.id, {
      paymentStatus: mapped.paymentStatus,
      bookingStatus: mapped.bookingStatus,
      xeroInvoiceStatus: status,
    });
  },

  async syncGovernmentPendingBookings(): Promise<{ synced: number }> {
    const pending = await xeroRepository.findBookingsPendingGovernmentSync();
    for (const row of pending) {
      await this.syncBookingInvoiceStatus(row.id);
    }
    return { synced: pending.length };
  },

  async downloadInvoicePdfForBooking(params: {
    bookingId: string;
    requesterUserId: string;
    isAdmin: boolean;
  }): Promise<Buffer> {
    const booking = await xeroRepository.findBookingInvoiceAccess(params.bookingId);
    if (!booking) {
      throw new AppError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
    }
    if (!params.isAdmin && booking.userId !== params.requesterUserId) {
      throw new AppError('FORBIDDEN', 'You are not allowed to access this invoice.', 403);
    }
    if (!booking.xeroInvoiceId) {
      throw new AppError('VALIDATION_ERROR', 'No Xero invoice linked to this booking yet.', 404);
    }

    const connection = await getValidConnection();
    const response = await fetch(`${XERO_ACCOUNTING_BASE}/Invoices/${booking.xeroInvoiceId}`, {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        'Xero-tenant-id': connection.tenantId,
        Accept: 'application/pdf',
      },
    });

    if (!response.ok) {
      const details = await response.text();
      logger.error({ bookingId: booking.id, details }, 'Xero invoice PDF download failed');
      throw new AppError('SERVER_ERROR', 'Failed to download invoice PDF from Xero.', 502);
    }

    const arr = await response.arrayBuffer();
    return Buffer.from(arr);
  },

  async emailInvoiceForBooking(params: {
    bookingId: string;
    requesterUserId: string;
    isAdmin: boolean;
  }): Promise<void> {
    const booking = await xeroRepository.findBookingInvoiceAccess(params.bookingId);
    if (!booking) {
      throw new AppError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
    }
    if (!params.isAdmin && booking.userId !== params.requesterUserId) {
      throw new AppError('FORBIDDEN', 'You are not allowed to email this invoice.', 403);
    }
    if (!booking.xeroInvoiceId) {
      throw new AppError('VALIDATION_ERROR', 'No Xero invoice linked to this booking yet.', 404);
    }

    const connection = await getValidConnection();
    const response = await fetch(`${XERO_ACCOUNTING_BASE}/Invoices/${booking.xeroInvoiceId}/Email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        'Xero-tenant-id': connection.tenantId,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const details = await response.text();
      logger.error({ bookingId: booking.id, details }, 'Xero invoice email send failed');
      throw new AppError('SERVER_ERROR', 'Failed to trigger invoice email in Xero.', 502);
    }
  },

  async createCreditNoteForBookingRefund(params: {
    bookingId: string;
    amount: number;
    reason: string;
  }): Promise<void> {
    const booking = await xeroRepository.findBookingForInvoice(params.bookingId);
    if (!booking?.xeroInvoiceId) return;
    if (!Number.isFinite(params.amount) || params.amount <= 0) return;

    const connection = await getValidConnection();

    const bookingReference = `BK-${booking.id.slice(-8).toUpperCase()}`;
    const description = `Refund for ${bookingReference} | Reason: ${params.reason}`;

    const payload = {
      CreditNotes: [
        {
          Type: 'ACCRECCREDIT',
          Contact: {
            Name: `${booking.user.firstName} ${booking.user.lastName}`.trim(),
            EmailAddress: booking.user.email,
          },
          Date: new Date().toISOString().split('T')[0],
          Status: 'AUTHORISED',
          Reference: bookingReference,
          LineItems: [
            {
              Description: description,
              Quantity: 1,
              UnitAmount: params.amount,
              ...(env.XERO_PAYMENT_ACCOUNT_CODE ? { AccountCode: env.XERO_PAYMENT_ACCOUNT_CODE } : {}),
            },
          ],
        },
      ],
    };

    const response = await fetch(`${XERO_ACCOUNTING_BASE}/CreditNotes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        'Xero-tenant-id': connection.tenantId,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = await response.text();
      logger.error({ bookingId: booking.id, details }, 'Xero credit note create failed');
    }
  },
};
