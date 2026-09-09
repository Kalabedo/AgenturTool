/**
 * Der rechte Rand des Dokuments.
 *
 * Chromium richtet den Seiteninhalt an einem Kasten aus und beschneidet die
 * gedruckte Seite dann auf einen, der eine Winzigkeit schmaler ist —
 * gemessen 0,7 pt. Alles, was bündig rechts steht, verlor dadurch eine
 * Scheibe: die „6" der Datumsangaben, die „4" der IBAN, und beim
 * schräggestellten „Entwurf" gleich das halbe „f".
 *
 * Diese Prüfungen halten die Geometrie fest, mit der das behoben ist. Ob
 * wirklich keine Tinte mehr am Beschnitt liegt, zeigt erst ein gerendertes
 * PDF; nachgemessen wurde das an sechs Varianten (Abschnitt 13a der
 * Architektur). Hier steht nur, was ohne Browser prüfbar ist — und das ist
 * genau das, was jemand beim Aufräumen versehentlich wegnähme.
 */
import { describe, expect, it } from 'vitest';
import { buildRenderModel } from '../src/render-model.js';
import { renderInvoiceFooterTemplate } from '../src/server.js';
import { CLASSIC_CSS, PAGE } from '../src/templates/classic/styles.js';
import { REFERENCE_INVOICE } from './fixtures.js';

/** Das CSS in einer Zeile — Zeilenumbrüche im Quelltext sollen nichts bedeuten. */
const css = CLASSIC_CSS.replace(/\s+/gu, ' ');

/** Der Rumpf einer Regel, ebenfalls ohne Zeilenumbrüche. */
function rules(selector: string): string[] {
  const found: string[] = [];
  const pattern = new RegExp(`\\${selector} \\{([^}]*)\\}`, 'gu');
  for (const match of css.matchAll(pattern)) found.push((match[1] ?? '').trim());
  return found;
}

describe('Spielraum am rechten Rand', () => {
  it('lässt mehr Luft, als Chromium beim Beschneiden verliert', () => {
    // 0,7 pt sind rund 0,25 mm. Weniger als das Doppelte wäre kein Spielraum,
    // sondern eine Wette darauf, dass jede Chromium-Fassung gleich rundet.
    expect(PAGE.edgeGapMm).toBeGreaterThan(0.5);
  });

  it('rückt am Bildschirm dasselbe ein wie im Druck', () => {
    // Liefen die beiden auseinander, bräche die Vorschau anders um als das
    // PDF — genau das, was die gemeinsame Komponente verhindern soll.
    const [screen, print] = rules('.page');

    expect(screen).toContain(
      `padding: ${PAGE.marginMm}mm ${PAGE.marginMm + PAGE.edgeGapMm}mm ${PAGE.footerMm}mm ${PAGE.marginMm}mm;`,
    );
    expect(print).toContain(`padding: 0 ${PAGE.edgeGapMm}mm 0 0;`);
  });

  it('lässt den linken Rand, wie er war', () => {
    // Der Spielraum ist eine Notwendigkeit am Beschnitt, keine Gestaltung:
    // Links gibt es nichts zu beschneiden, also bleibt der Rand dort ganz.
    expect(css).toContain(`@page { size: A4; margin: ${PAGE.marginMm}mm ${PAGE.marginMm}mm`);
  });

  it('fluchtet die Fußzeile mit dem Textblock darüber', () => {
    const footer = renderInvoiceFooterTemplate(buildRenderModel(REFERENCE_INVOICE));

    expect(footer).toContain(`padding:0 ${PAGE.marginMm + PAGE.edgeGapMm}mm 0 ${PAGE.marginMm}mm;`);
  });
});

describe('Platzhalter statt Rechnungsnummer', () => {
  it('steht aufrecht', () => {
    // Eingebettet sind nur Regular und Bold: Ein font-style: italic ergibt
    // eine von Chromium schräggestellte Regular, deren Tinte bis zu 2 pt
    // über die Laufweite hinausragt. Rechtsbündig ist das der sichere Weg
    // in den Beschnitt.
    const [placeholder] = rules('.meta__value--placeholder');

    expect(placeholder).not.toContain('font-style');
  });

  it('bleibt trotzdem als Platzhalter erkennbar', () => {
    const [placeholder] = rules('.meta__value--placeholder');

    expect(placeholder).toContain('color: var(--ink-soft);');
  });
});
