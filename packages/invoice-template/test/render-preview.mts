/**
 * Erzeugt HTML-Dateien zum Ansehen. Kein Test — ein Werkzeug, um das
 * Layout im Browser zu prüfen, ohne die ganze Anwendung zu starten.
 *
 *   pnpm --filter @agentur-tool/invoice-template preview <zielordner>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DISCOUNT_TYPE, toIsoDate } from '@agentur-tool/shared';
import { buildRenderModel } from '../src/render-model.js';
import { renderInvoiceDocument } from '../src/server.js';
import {
  DEFAULT_TEMPLATE,
  REFERENCE_BUYER,
  REFERENCE_INVOICE,
  REFERENCE_SELLER,
  STANDARD_TAX,
} from './fixtures.js';

const outDir = process.argv[2] ?? join(process.cwd(), 'preview-out');
mkdirSync(outDir, { recursive: true });

function write(name: string, html: string): void {
  const file = join(outDir, `${name}.html`);
  writeFileSync(file, html, 'utf8');
  console.log(file);
}

write('referenz', renderInvoiceDocument(buildRenderModel(REFERENCE_INVOICE)));

write(
  'mit-steuer-und-rabatt',
  renderInvoiceDocument(
    buildRenderModel({
      ...REFERENCE_INVOICE,
      number: null,
      tax: STANDARD_TAX,
      serviceDateTo: toIsoDate('2025-08-15'),
      notes: 'Die Abnahme erfolgte am 24.07.2025 durch Frau Meier.',
      buyer: { ...REFERENCE_BUYER, customerNumber: 'K-1042', contactName: 'z. Hd. Frau Meier' },
      seller: { ...REFERENCE_SELLER, phone: '+49 7961 123456', taxNumber: '87/123/45678' },
      template: {
        ...DEFAULT_TEMPLATE,
        paymentNote: 'Bitte überweisen Sie den Rechnungsbetrag bis zum Fälligkeitsdatum.',
        closingNote: 'Vielen Dank für die gute Zusammenarbeit.',
        footerText:
          'XYZ - Agentur · Wolfgangsklinge 14 · 73479 Ellwangen · Amtsgericht Ulm HRB 12345',
      },
      items: [
        {
          description: 'Konzeption und Umsetzung Relaunch\nInklusive Abstimmungsrunden',
          quantity: 32500,
          unit: 'Std.',
          unitPriceCents: 9500,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 1000,
          taxRateBasisPoints: 1900,
        },
        {
          description: 'Lizenz Bildmaterial',
          quantity: 1000,
          unit: null,
          unitPriceCents: 24900,
          discountType: DISCOUNT_TYPE.AMOUNT,
          discountValue: 4900,
          taxRateBasisPoints: 1900,
        },
        {
          description: 'Fachbuch „Barrierefreies Web"',
          quantity: 2000,
          unit: 'Stk.',
          unitPriceCents: 3990,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 0,
          taxRateBasisPoints: 700,
        },
        {
          description: 'Hosting Grundgebühr',
          quantity: 12000,
          unit: 'Monat',
          unitPriceCents: 4000,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 0,
          taxRateBasisPoints: 1900,
        },
      ],
    }),
  ),
);

write(
  'leerer-entwurf',
  renderInvoiceDocument(
    buildRenderModel({
      ...REFERENCE_INVOICE,
      number: null,
      items: [],
      buyer: {
        ...REFERENCE_BUYER,
        companyName: '',
        addressLine: null,
        vatId: null,
        address: { street: '', postalCode: '', city: '', country: '' },
      },
    }),
  ),
);
