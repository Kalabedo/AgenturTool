import { z } from 'zod';
import type { BuyerData } from './snapshots.js';

/**
 * „Neue Rechnung auf Basis dieser Rechnung."
 *
 * Der Vorgang hat zwei Anlässe, die sich äußerlich gleichen und inhaltlich
 * widersprechen:
 *
 * - **Wiederkehrende Leistung.** Dieselben Positionen, aber der Kunde ist
 *   inzwischen umgezogen oder hat eine USt-IdNr. bekommen. Hier sind die
 *   alten Empfängerdaten schlicht falsch.
 * - **Korrektur nach einem Storno.** Dasselbe Dokument noch einmal, und
 *   zwar mit genau der Anschrift, die darauf stand — womöglich einer
 *   bewusst abweichenden Rechnungsanschrift, die in den Stammdaten gar
 *   nicht vorkommt. Hier wären die aktuellen Stammdaten falsch.
 *
 * Deshalb entscheidet nicht der Code, sondern der Benutzer — aber erst,
 * nachdem er gesehen hat, worum es geht. Diese Datei liefert die Grundlage
 * dafür: eine Gegenüberstellung dessen, was übernommen und was aktualisiert
 * würde. Sie wird vom Server berechnet und von der Oberfläche nur
 * dargestellt, damit im Dialog nichts anderes steht als das, was gleich
 * geschieht.
 */

/**
 * Ob die aktuellen Kundenvorgaben übernommen werden.
 *
 * Vorbelegt mit `true`, weil die Oberfläche das Häkchen gesetzt anbietet
 * und ein direkter API-Aufruf dieselbe Rechnung bekommen soll wie ein Klick
 * — dieselbe Begründung wie bei der Vorbelegung in `createDraft`.
 */
export const rebillInputSchema = z
  .object({
    refreshCustomerDefaults: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((value) => value === true || value === 'true')
      .optional()
      .default(true),
  })
  .default({});
export type RebillInput = z.input<typeof rebillInputSchema>;
export type RebillPayload = z.output<typeof rebillInputSchema>;

/** Ein Feld, das sich zwischen alter Rechnung und Stammdaten unterscheidet. */
export const rebillFieldChangeSchema = z.object({
  label: z.string(),
  from: z.string(),
  to: z.string(),
});
export type RebillFieldChange = z.infer<typeof rebillFieldChangeSchema>;

/**
 * Warum die Kundenvorgaben angeboten werden — oder eben nicht.
 *
 * Der Unterschied zwischen „kein Kunde zugeordnet" und „Kunde gelöscht" ist
 * für den Benutzer keiner von Nuancen: Im ersten Fall war nie einer da, im
 * zweiten fehlt etwas, das da sein sollte. Zwei Fälle, zwei Sätze.
 */
export const REBILL_CUSTOMER_STATE = {
  /** Kunde vorhanden; seine Vorgaben lassen sich übernehmen. */
  AVAILABLE: 'AVAILABLE',
  /** Die Rechnung ist keinem Kunden zugeordnet. */
  NONE: 'NONE',
  /** Der zugeordnete Kunde existiert nicht mehr. */
  MISSING: 'MISSING',
} as const;
export type RebillCustomerState =
  (typeof REBILL_CUSTOMER_STATE)[keyof typeof REBILL_CUSTOMER_STATE];

export const REBILL_CUSTOMER_STATE_VALUES = Object.values(REBILL_CUSTOMER_STATE);

export const rebillPreviewResponseSchema = z.object({
  /** Wie die Quelle heißt — „2026-014" oder „Entwurf #3". */
  sourceName: z.string(),

  // Was unverändert mitkommt.
  itemCount: z.number().int(),
  netCents: z.number().int(),
  grossCents: z.number().int(),
  carriesNotes: z.boolean(),
  carriesFooterNote: z.boolean(),

  // Was in jedem Fall neu gesetzt wird — ein Duplikat ist eine Rechnung von
  // heute, kein Abzug von damals.
  invoiceDate: z.string(),
  serviceDate: z.string(),
  dueDate: z.string(),
  paymentTermDays: z.number().int(),
  /** Ob das Zahlungsziel vom Kunden kommt oder aus den Unternehmensvorgaben. */
  paymentTermFromCustomer: z.boolean(),

  // Was nur mit gesetztem Häkchen geschieht.
  customerState: z.enum(REBILL_CUSTOMER_STATE_VALUES as [string, ...string[]]),
  customerName: z.string().nullable(),
  /** Ein archivierter Kunde ist kein Fehler, aber eine Rückfrage wert. */
  customerArchived: z.boolean(),
  buyerChanges: z.array(rebillFieldChangeSchema),
  /**
   * Wechsel des Steuerprofils, oder null.
   *
   * Steht getrennt von `buyerChanges`, weil er es auch ist: Eine geänderte
   * Straße ändert die Anschrift, ein geändertes Steuerprofil ändert den
   * Betrag und den rechtlichen Hinweis darunter.
   */
  taxProfileChange: z.object({ from: z.string(), to: z.string() }).nullable(),
});
export type RebillPreviewResponse = z.infer<typeof rebillPreviewResponseSchema>;

/** Leer und „nicht gesetzt" sind für den Vergleich dasselbe. */
function normalize(value: string | null): string {
  return (value ?? '').trim();
}

/** Was im Dialog steht, wenn ein Feld leer ist. */
function display(value: string | null): string {
  const trimmed = normalize(value);
  return trimmed === '' ? '—' : trimmed;
}

/**
 * Die Felder der Empfängerdaten, in der Reihenfolge, in der sie auf der
 * Rechnung stehen — damit die Liste im Dialog dem Dokument folgt und nicht
 * der Feldreihenfolge des Schemas.
 */
function buyerFields(data: BuyerData): [label: string, value: string | null][] {
  return [
    ['Firmenname', data.companyName],
    ['Ansprechpartner', data.contactName],
    ['Adresszusatz', data.addressLine],
    ['Straße', data.address.street],
    ['PLZ', data.address.postalCode],
    ['Ort', data.address.city],
    ['Land', data.address.country],
    ['E-Mail', data.email],
    ['USt-IdNr.', data.vatId],
    ['Kundennummer', data.customerNumber],
    ['Käuferreferenz', data.buyerReference],
    ['Elektronische Adresse', data.electronicAddress],
  ];
}

/**
 * Was sich zwischen den Empfängerdaten der alten Rechnung und dem heutigen
 * Stammdatenstand unterscheidet.
 *
 * Nur die Unterschiede, nicht alle Felder: Eine Liste, in der zwölf Zeilen
 * „unverändert" sagen, versteckt die eine, die es nicht ist.
 */
export function diffBuyerData(from: BuyerData, to: BuyerData): RebillFieldChange[] {
  const before = buyerFields(from);
  const after = buyerFields(to);

  return before
    .map((field, index) => ({ label: field[0], from: field[1], to: after[index]?.[1] ?? null }))
    .filter((change) => normalize(change.from) !== normalize(change.to))
    .map((change) => ({
      label: change.label,
      from: display(change.from),
      to: display(change.to),
    }));
}
