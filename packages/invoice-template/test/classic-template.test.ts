import { describe, expect, it } from 'vitest';
import { DISCOUNT_TYPE, DOCUMENT_TYPE, negateInvoiceItems, toIsoDate } from '@privatura/shared';
import { buildRenderModel } from '../src/render-model.js';
import { renderInvoiceDocument } from '../src/server.js';
import { DEFAULT_TEMPLATE, REFERENCE_BUYER, REFERENCE_INVOICE, STANDARD_TAX } from './fixtures.js';

/**
 * Tests gegen das gerenderte Markup.
 *
 * Bewusst kein Schnappschuss des gesamten HTML: Ein solcher Test schlägt bei
 * jeder Änderung an einer Klasse fehl und wird dann blind neu geschrieben.
 * Geprüft wird stattdessen, was auf einer Rechnung stimmen muss.
 */

function render(source: Parameters<typeof buildRenderModel>[0]): string {
  return renderInvoiceDocument(buildRenderModel(source));
}

describe('Classic-Template', () => {
  it('zeigt die Beträge der Referenzrechnung', () => {
    const html = render(REFERENCE_INVOICE);

    expect(html).toContain('2025-003');
    expect(html).toContain('26.07.2025');
    expect(html).toContain('09.08.2025');
    expect(html).toContain('195,00');
    expect(html).toContain('259,00');
  });

  it('druckt den Hinweistext des Steuerprofils', () => {
    expect(render(REFERENCE_INVOICE)).toContain('Reverse Charge');
  });

  it('lässt bei 0 % keine Steuerzeile in den Summen entstehen', () => {
    // Warum keine Steuer anfällt, sagt der Hinweistext — eine Zeile
    // „0,00 €" sagt es nicht und wirft nur Fragen auf.
    expect(render(REFERENCE_INVOICE)).not.toContain('zzgl.');
  });

  it('weist Steuer je Satz aus, nicht je Position', () => {
    const html = render({
      ...REFERENCE_INVOICE,
      tax: STANDARD_TAX,
      items: [
        {
          description: 'A',
          quantity: 1000,
          unit: null,
          unitPriceCents: 10000,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 0,
          taxRateBasisPoints: 1900,
        },
        {
          description: 'B',
          quantity: 1000,
          unit: null,
          unitPriceCents: 2000,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 0,
          taxRateBasisPoints: 700,
        },
      ],
    });

    expect(html).toContain('zzgl. 7 % USt.');
    expect(html).toContain('zzgl. 19 % USt.');
  });

  it('blendet die Rabattspalte aus, solange kein Rabatt vergeben ist', () => {
    expect(render(REFERENCE_INVOICE)).not.toContain('Rabatt');
  });

  it('zeigt die Rabattspalte, sobald eine Position einen Rabatt hat', () => {
    const html = render({
      ...REFERENCE_INVOICE,
      items: [
        {
          description: 'Beratung',
          quantity: 1000,
          unit: null,
          unitPriceCents: 10000,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 1000,
          taxRateBasisPoints: 0,
        },
      ],
    });

    expect(html).toContain('Rabatt');
    expect(html).toContain('10 %');
  });

  it('zeigt die Einheit hinter der Menge', () => {
    const html = render({
      ...REFERENCE_INVOICE,
      items: [
        {
          description: 'Beratung',
          quantity: 7500,
          unit: 'Std.',
          unitPriceCents: 10000,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 0,
          taxRateBasisPoints: 0,
        },
      ],
    });

    expect(html).toContain('7,5 Std.');
  });

  it('lässt das Land weg, wenn es dem des Absenders entspricht', () => {
    const html = render({
      ...REFERENCE_INVOICE,
      buyer: {
        ...REFERENCE_BUYER,
        address: { street: 'Musterweg 1', postalCode: '73479', city: 'Ellwangen', country: 'DE' },
      },
    });

    expect(html).toContain('73479 Ellwangen');
    // „DE" als eigene Zeile wäre auf einer deutschen Rechnung an einen
    // deutschen Kunden reine Zeilenverschwendung.
    expect(html).not.toMatch(/<li>DE<\/li>/u);
  });

  it('nennt einen Entwurf ohne Nummer beim Namen', () => {
    const html = render({ ...REFERENCE_INVOICE, number: null });
    expect(html).toContain('Entwurf');
  });

  it('beschriftet einen Storno als Stornorechnung und zeigt negative Beträge', () => {
    const html = render({
      ...REFERENCE_INVOICE,
      documentType: DOCUMENT_TYPE.CANCELLATION,
      number: '2025-004',
      items: negateInvoiceItems(
        REFERENCE_INVOICE.items.map((item) => ({
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          discountType: item.discountType,
          discountValue: item.discountValue,
          taxRateBasisPoints: item.taxRateBasisPoints,
        })),
      ).map((item, index) => ({
        ...item,
        description: REFERENCE_INVOICE.items[index]?.description ?? '',
        unit: null,
      })),
    });

    expect(html).toContain('Stornorechnung');
    expect(html).toContain('-259,00');
  });

  it('zeigt Platzhalter statt eines leeren Blattes, solange nichts erfasst ist', () => {
    const html = render({
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

    expect(html).toContain('Noch kein Kunde ausgewählt');
    expect(html).toContain('Noch keine Positionen erfasst.');
  });

  it('erhält Zeilenumbrüche in mehrzeiligen Beschreibungen', () => {
    const html = render({
      ...REFERENCE_INVOICE,
      items: [
        {
          description: 'Zeile eins\nZeile zwei',
          quantity: 1000,
          unit: null,
          unitPriceCents: 1000,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 0,
          taxRateBasisPoints: 0,
        },
      ],
    });

    expect(html).toContain('Zeile eins\nZeile zwei');
    expect(html).toContain('white-space: pre-wrap');
  });

  it('setzt Akzentfarbe und Logobreite aus den Template-Einstellungen', () => {
    const html = render({
      ...REFERENCE_INVOICE,
      template: { ...DEFAULT_TEMPLATE, accentColor: '#b91c1c', logoWidthMm: 55 },
    });

    expect(html).toContain('#b91c1c');
    expect(html).toContain('55mm');
  });

  it('zeigt einen Leistungszeitraum als Von-bis-Angabe', () => {
    const html = render({
      ...REFERENCE_INVOICE,
      serviceDate: toIsoDate('2025-07-01'),
      serviceDateTo: toIsoDate('2025-07-31'),
    });

    expect(html).toContain('01.07.2025 – 31.07.2025');
  });
});

describe('renderInvoiceDocument', () => {
  /**
   * Die Grundlage für Schritt 8: Gerendert wird in einer Umgebung ohne
   * Netzwerkzugriff. Bliebe hier eine externe Adresse stehen, fehlte im PDF
   * still die Schrift oder das Logo — und das Dokument wäre trotzdem
   * scheinbar in Ordnung.
   */
  it('kommt ohne einen einzigen externen Verweis aus', () => {
    const html = renderInvoiceDocument(buildRenderModel(REFERENCE_INVOICE));

    expect(html).not.toMatch(/https?:\/\//u);
    expect(html).toContain('data:font/woff2;base64,');
  });

  it('bettet die Schrift in beiden Schnitten ein', () => {
    const html = renderInvoiceDocument(buildRenderModel(REFERENCE_INVOICE));

    expect(html).toContain('font-weight: 400');
    expect(html).toContain('font-weight: 700');
  });

  it('erzeugt ein vollständiges HTML-Dokument mit Titel', () => {
    const html = renderInvoiceDocument(buildRenderModel(REFERENCE_INVOICE));

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Rechnung 2025-003</title>');
    expect(html).toContain('@page');
  });

  it('maskiert Sonderzeichen im Titel', () => {
    const html = renderInvoiceDocument(buildRenderModel(REFERENCE_INVOICE), {
      title: 'Rechnung <script>',
    });

    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<title>Rechnung <script></title>');
  });

  /**
   * Ein unbekannter templateKey darf das PDF nicht verhindern.
   *
   * Beträge und Texte stammen aus dem Snapshot und bleiben unverändert —
   * ein anderes Layout ist deutlich besser als gar kein Dokument.
   */
  it('fällt bei unbekanntem Template auf classic zurück', () => {
    const html = renderInvoiceDocument(
      buildRenderModel({
        ...REFERENCE_INVOICE,
        template: { ...DEFAULT_TEMPLATE, templateKey: 'gibt-es-nicht' },
      }),
    );

    expect(html).toContain('2025-003');
    expect(html).toContain('259,00');
  });
});
