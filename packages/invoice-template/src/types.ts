import type {
  BuyerData,
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
  /** Logo als Data-URI, damit das PDF ohne Netzwerkzugriff rendert. */
  logoDataUri: string | null;
}

export interface InvoiceRenderItem {
  position: number;
  description: string;
  /** Tausendstel: 7,5 h = 7500 */
  quantity: number;
  unit: string | null;
  unitPriceCents: number;
  discountCents: number;
  /** Basispunkte: 19 % = 1900 */
  taxRateBasisPoints: number;
  netCents: number;
}

/** Ein registriertes Template: Komponente plus zugehöriges CSS. */
export interface TemplateDefinition {
  key: string;
  label: string;
  /** Wird in Schritt 7 mit der React-Komponente gefüllt. */
  css: string;
}
