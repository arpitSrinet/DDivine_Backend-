/**
 * @file invoices.service.ts
 * @description Invoice creation (triggered by payment.succeeded event) and retrieval.
 * @module src/modules/invoices/invoices.service
 */
import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/infrastructure/logger.js';
import { prisma } from '@/shared/infrastructure/prisma.js';

import { invoicesRepository } from './invoices.repository.js';
import type { IInvoiceResponse } from './invoices.schema.js';

function mapToInvoiceResponse(invoice: {
  id: string;
  paymentId: string;
  pdfUrl: string | null;
  createdAt: Date;
}): IInvoiceResponse {
  return {
    id: invoice.id,
    paymentId: invoice.paymentId,
    ...(invoice.pdfUrl && { pdfUrl: invoice.pdfUrl }),
    createdAt: invoice.createdAt.toISOString(),
  };
}

export const invoicesService = {
  async createForPayment(paymentId: string): Promise<void> {
    const existing = await invoicesRepository.findByPaymentId(paymentId);
    if (existing) {
      logger.info({ paymentId }, 'Invoice already exists for payment — skipping');
      return;
    }

    // Inherit the Xero invoice ID from the linked booking so the DB Invoice row
    // and the Xero invoice are formally connected from the start.
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { bookingId: true },
    });
    let xeroInvoiceId: string | undefined;
    if (payment?.bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: payment.bookingId },
        select: { xeroInvoiceId: true },
      });
      xeroInvoiceId = booking?.xeroInvoiceId ?? undefined;
    }

    const invoice = await invoicesRepository.create(paymentId, xeroInvoiceId);
    logger.info({ invoiceId: invoice.id, paymentId, xeroInvoiceId }, 'Invoice created');
  },

  async getInvoiceById(invoiceId: string): Promise<IInvoiceResponse> {
    const invoice = await invoicesRepository.findById(invoiceId);
    if (!invoice) {
      throw new AppError('ACCOUNT_NOT_FOUND', 'Invoice not found.', 404);
    }
    return mapToInvoiceResponse(invoice);
  },
};
