/**
 * @file invoices.schema.ts
 * @description Zod schemas for invoice endpoints.
 *
 * Invoices are created automatically on payment.succeeded event — no public creation endpoint.
 *
 * Endpoints:
 *   GET /api/v1/invoices/:invoiceId → response: InvoiceResponse
 *
 * @module src/modules/invoices/invoices.schema
 */
import { z } from 'zod';

export const InvoiceIdParamSchema = z.object({
  invoiceId: z.string().min(1),
});

export const InvoiceResponseSchema = z.object({
  id: z.string(),
  paymentId: z.string(),
  pdfUrl: z.string().optional(),
  createdAt: z.string(),
});

export type IInvoiceIdParam = z.infer<typeof InvoiceIdParamSchema>;
export type IInvoiceResponse = z.infer<typeof InvoiceResponseSchema>;
