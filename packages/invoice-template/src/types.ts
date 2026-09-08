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
 * Modell im Browser (Live-Vorschau) und im Backend (Puppeteer) verwendbar,
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
   * Data-URI. Puppeteer rendert in einem Container ohne Zugriff auf die
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

/**
 * Ein registriertes Template: Komponente plus zugehöriges CSS.
 *
 * Das CSS liegt als String daneben und nicht als Import in der Komponente,
 * weil es an zwei Orte muss, die kein Bundler bedient: in das <style> des
 * Vorschau-iframes und in das HTML-Dokument für Puppeteer.
 */
export interface TemplateDefinition {
  key: string;
  label: string;
  css: string;
  render: (model: InvoiceRenderModel) => JSX.Element;
}
