/**
 * Erzeugt HTML-Dateien zum Ansehen. Kein Test — ein Werkzeug, um das
 * Layout im Browser zu prüfen, ohne die ganze Anwendung zu starten.
 *
 *   pnpm --filter @privatura/invoice-template preview <zielordner>
 *   pnpm --filter @privatura/invoice-template preview <ordner> --design modern
 *
 * Ohne `--design` entsteht jede Variante für jedes Design, dazu einmal die
 * drei Dichtestufen. Das sind die Dateien, an denen die Designs entstanden
 * sind und an denen ein Umbau zu prüfen ist: Seitenumbrüche und Abstände
 * zeigen sich im Browser sofort und in keinem Test.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DISCOUNT_TYPE, toIsoDate } from '@privatura/shared';
import { buildRenderModel } from '../src/render-model.js';
import { renderInvoiceDocument } from '../src/server.js';
import {
  DEFAULT_TEMPLATE,
  REFERENCE_BUYER,
  REFERENCE_INVOICE,
  REFERENCE_SELLER,
  STANDARD_TAX,
} from './fixtures.js';

import { listTemplates } from '../src/registry.js';
import type { RenderModelSource } from '../src/render-model.js';

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const outDir = args[0] ?? join(process.cwd(), 'preview-out');
const designIndex = process.argv.indexOf('--design');
const onlyDesign = designIndex === -1 ? null : process.argv[designIndex + 1];

const designs = listTemplates().filter((d) => onlyDesign === null || d.key === onlyDesign);
if (designs.length === 0) {
  console.error(`Kein Design namens "${onlyDesign ?? ''}".`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

/** Dieselbe Variante einmal je Design. */
function writeForEachDesign(name: string, source: RenderModelSource): void {
  for (const design of designs) {
    const dir = join(outDir, design.key);
    mkdirSync(dir, { recursive: true });
    const html = renderInvoiceDocument(
      buildRenderModel({
        ...source,
        template: { ...source.template, templateKey: design.key },
      }),
    );
    const file = join(dir, `${name}.html`);
    writeFileSync(file, html, 'utf8');
    console.log(file);
  }
}

writeForEachDesign('referenz', REFERENCE_INVOICE);

writeForEachDesign('mit-steuer-und-rabatt', {
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
    footerText: 'XYZ - Agentur · Wolfgangsklinge 14 · 73479 Ellwangen · Amtsgericht Ulm HRB 12345',
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
});

writeForEachDesign('leerer-entwurf', {
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
});

/*
 * Ein langes Dokument je Dichtestufe. Hier zeigt sich, was die Stufe
 * wirklich bewirkt — nämlich, wo die Seite umbricht.
 */
const manyItems = Array.from({ length: 34 }, (_, index) => ({
  description: `Position ${index + 1} — Leistung nach Aufwand`,
  quantity: 1500,
  unit: 'Std.',
  unitPriceCents: 9500,
  discountType: DISCOUNT_TYPE.PERCENT,
  discountValue: 0,
  taxRateBasisPoints: 1900,
}));

for (const density of ['kompakt', 'normal', 'luftig'] as const) {
  writeForEachDesign(`dichte-${density}`, {
    ...REFERENCE_INVOICE,
    tax: STANDARD_TAX,
    template: { ...DEFAULT_TEMPLATE, density },
    items: manyItems,
  });
}
