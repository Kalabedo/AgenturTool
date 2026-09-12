import type { PageGeometry } from './design/page.js';
import type {
  BuyerData,
  DiscountType,
  DocumentType,
  IsoDate,
  SellerSnapshot,
  TaxSnapshot,
  TemplateSnapshot,
  TotalsSnapshot,
} from '@agentur-tool/shared';

/**
 * Das Modell, das ein Template zum Rendern bekommt.
 *
 * Bewusst vollständig aufgelöst: Ein Template führt keine Datenbankabfragen
 * und keine Berechnungen durch, es stellt nur dar. Dadurch ist dasselbe
 * Modell im Browser (Live-Vorschau) und im Backend (Druck) verwendbar,
 * und ein Snapshot einer alten Rechnung lässt sich unverändert einsetzen.
 */
export interface InvoiceRenderModel {
  documentType: DocumentType;
  /** Bei Entwürfen null — die Nummer entsteht erst beim Finalisieren (D5). */
  number: string | null;
  invoiceDate: IsoDate;
  serviceDate: IsoDate;
  serviceDateTo: IsoDate | null;
  dueDate: IsoDate;
  currency: string;
  seller: SellerSnapshot;
  buyer: BuyerData;
  tax: TaxSnapshot;
  template: TemplateSnapshot;
  totals: TotalsSnapshot;
  items: InvoiceRenderItem[];
  notes: string | null;
  footerNote: string | null;
  /**
   * Quelle des Logos.
   *
   * In der Live-Vorschau eine API-Adresse (`/api/assets/7`), im PDF eine
   * Data-URI. Gerendert wird ohne Zugriff auf die
   * laufende API — ein Bild per URL bliebe dort leer, und zwar lautlos.
   */
  logoSrc: string | null;
}

export interface InvoiceRenderItem {
  position: number;
  description: string;
  /** Tausendstel: 7,5 h = 7500 */
  quantity: number;
  unit: string | null;
  unitPriceCents: number;
  discountType: DiscountType;
  /** Basispunkte bei PERCENT, Cent bei AMOUNT. */
  discountValue: number;
  /** Der ausgerechnete Rabatt in Cent — auch bei Prozentangaben. */
  discountCents: number;
  /** Basispunkte: 19 % = 1900 */
  taxRateBasisPoints: number;
  netCents: number;
}

/** Farbregler, die ein Design benutzen kann. */
export type TemplateColorKnob = 'accent' | 'ink' | 'inkSoft' | 'rule' | 'band';

/** Blockschalter, die ein Design beachten kann. */
export type TemplateBlockKnob = 'logo' | 'paymentBlock' | 'footerRule';

/**
 * Welche Regler ein Design tatsächlich benutzt.
 *
 * Der Designer blendet danach aus, was nichts bewirkt: „schlicht" kennt
 * weder Linien noch Flächen, also hätten ein Linien- und ein Flächenregler
 * dort nur den Anschein einer Wirkung.
 *
 * Wichtig: Die Angabe steuert allein die Oberfläche, nie den Snapshot. Alle
 * Werte werden immer gespeichert — sonst verlöre ein Wechsel des Designs
 * und zurück die eingestellte Flächenfarbe.
 */
export interface TemplateCapabilities {
  colors: readonly TemplateColorKnob[];
  blocks: readonly TemplateBlockKnob[];
  density: boolean;
  logoWidth: boolean;
}

/**
 * Ein registriertes Template: Komponente plus zugehöriges CSS.
 *
 * Das CSS liegt als String daneben und nicht als Import in der Komponente,
 * weil es an zwei Orte muss, die kein Bundler bedient: in das <style> des
 * Vorschau-iframes und in das HTML-Dokument für den Druck.
 */
export interface TemplateDefinition {
  key: string;
  label: string;
  /** Ein Satz für die Auswahl im Designer: wofür dieses Design gedacht ist. */
  description: string;
  /**
   * Die Seitengeometrie dieses Designs.
   *
   * Quelle für `@page` **und** für die Fußzeile, die Chromium auf jede Seite
   * setzt. Beide müssen dieselben Ränder benutzen, sonst fluchtet die
   * Seitenzahl nicht mit dem Text darüber.
   */
  page: PageGeometry;
  capabilities: TemplateCapabilities;
  css: string;
  render: (model: InvoiceRenderModel) => JSX.Element;
  /**
   * Eine eigene Fußzeile, falls die gemeinsame nicht passt.
   *
   * „schlicht" verzichtet auf das Dokumentkennzeichen links und setzt nur
   * die Seitenzahl. Ohne diesen Haken müsste die gemeinsame Fußzeile alle
   * Sonderfälle aller Designs kennen.
   */
  footer?: (model: InvoiceRenderModel, page: PageGeometry) => string;
}
