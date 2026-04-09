/**
 * @file generateInvoicePdf.ts
 * @description Processor: generates a PDF invoice using pdfkit and stores it.
 * In production, upload to cloud storage and update Invoice.pdfUrl.
 * In development, the PDF is generated in-memory and logged.
 * @module src/modules/jobs/processors/generateInvoicePdf
 */
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import PDFDocument from 'pdfkit';

import { logger } from '@/shared/infrastructure/logger.js';
import { prisma } from '@/shared/infrastructure/prisma.js';

import type { GenerateInvoicePdfJobData } from '../queues/invoice.queue.js';

export async function generateInvoicePdf(data: GenerateInvoicePdfJobData): Promise<void> {
  const outputDir = join(process.cwd(), 'tmp', 'invoices');
  mkdirSync(outputDir, { recursive: true });

  const filename = `invoice-${data.invoiceId}.pdf`;
  const outputPath = join(outputDir, filename);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = createWriteStream(outputPath);
    doc.pipe(stream);

    // Header
    doc.fontSize(24).text('DDivine Training', { align: 'right' });
    doc.fontSize(10).text('noreply@ddivine.co.uk', { align: 'right' });
    doc.moveDown(2);

    doc.fontSize(20).text('INVOICE', { align: 'left' });
    doc.moveDown();

    // Invoice details
    doc.fontSize(10);
    doc.text(`Invoice ID: ${data.invoiceId}`);
    doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`);
    doc.text(`Payment Ref: ${data.paymentId}`);
    doc.moveDown();

    // Customer details
    doc.fontSize(12).text('Billed To:');
    doc.fontSize(10);
    doc.text(`${data.userFirstName} ${data.userLastName}`);
    doc.text(data.userEmail);
    doc.moveDown();

    // Line items
    doc.fontSize(12).text('Services:');
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .text(`${data.serviceName}`, { continued: true })
      .text(`  ${data.sessionDate}`, { continued: true })
      .text(
        `  £${data.amount.toFixed(2)}`,
        { align: 'right' },
      );
    doc.moveDown();

    // Total
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .text('Total:', { continued: true })
      .text(`£${data.amount.toFixed(2)}`, { align: 'right' });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  // Store local path as pdfUrl (replace with S3/cloud URL in production)
  const pdfUrl = `/invoices/${filename}`;
  await prisma.invoice.update({
    where: { id: data.invoiceId },
    data: { pdfUrl },
  });

  logger.info({ invoiceId: data.invoiceId, pdfUrl }, 'Invoice PDF generated');
}
