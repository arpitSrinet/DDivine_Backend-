/**
 * @file invoices.repository.ts
 * @description Data access layer for invoices.
 * @module src/modules/invoices/invoices.repository
 */
import { prisma } from '@/shared/infrastructure/prisma.js';

export const invoicesRepository = {
  async create(paymentId: string) {
    return prisma.invoice.create({
      data: { paymentId },
    });
  },

  async findById(invoiceId: string) {
    return prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
  },

  async findByPaymentId(paymentId: string) {
    return prisma.invoice.findUnique({
      where: { paymentId },
    });
  },
};
