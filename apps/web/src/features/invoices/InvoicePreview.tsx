import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_UNIT_CODE,
  type UnitCode,
  CURRENT_SNAPSHOT_VERSION,
  isValidIsoDate,
  sellerSnapshotFromCompany,
  taxSnapshotFromProfile,
  templateSnapshotFromSettings,
  toIsoDate,
  type BuyerData,
  type CompanyResponse,
  type InvoiceResponse,
  type IsoDate,
  type TaxProfileResponse,
  type TemplateSettingsResponse,
} from '@agentur-tool/shared';
import {
  CLASSIC_CSS,
  ClassicTemplate,
  buildRenderModel,
  type RenderModelSourceItem,
} from '@agentur-tool/invoice-template';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { TemplateFrame } from '../../components/TemplateFrame.js';
import type { InvoiceFormValues } from './invoiceFormValues.js';
import { toCalculationItems } from './toCalculationItems.js';

/**
 * Die Live-Vorschau des Dokuments.
 *
 * Sie rendert dieselbe Komponente, die im Backend für das PDF
 * benutzt, mit demselben Stylesheet und derselben eingebetteten Schrift.
 * Deshalb ist das hier keine Annäherung an das spätere PDF, sondern —
 * abgesehen vom Seitenumbruch, den erst der Druck kennt — dasselbe Bild.
 *
 * Die Stammdaten kommen live aus der API und nicht aus einem Snapshot: Ein
 * Entwurf soll die heutigen Firmendaten zeigen (D9). Eingefroren wird erst
 * beim Finalisieren, und zwar über dieselben Mapper, die hier laufen.
 */

/**
 * Ein unfertiges Datum darf die Vorschau nicht abstürzen lassen.
 *
 * Während des Tippens steht im Feld kurzzeitig „2026-1" — kein gültiges
 * ISO-Datum. Statt einer Ausnahme zeigt die Vorschau dann das zuletzt
 * gültige Ersatzdatum weiter.
 */
function asIsoDateOr(value: string, fallback: IsoDate): IsoDate {
  return isValidIsoDate(value) ? value : fallback;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toBuyerData(values: InvoiceFormValues): BuyerData {
  return {
    snapshotVersion: CURRENT_SNAPSHOT_VERSION,
    companyName: values.companyName.trim(),
    contactName: emptyToNull(values.contactName),
    addressLine: emptyToNull(values.addressLine),
    address: {
      street: values.street.trim(),
      postalCode: values.postalCode.trim(),
      city: values.city.trim(),
      country: values.country.trim(),
    },
    email: emptyToNull(values.email),
    vatId: emptyToNull(values.vatId),
    customerNumber: emptyToNull(values.customerNumber),
    buyerReference: emptyToNull(values.buyerReference),
    electronicAddress: emptyToNull(values.electronicAddress),
    electronicAddressScheme: emptyToNull(values.electronicAddressScheme),
  };
}

function toRenderItems(values: InvoiceFormValues): RenderModelSourceItem[] {
  const calculationItems = toCalculationItems(values.items);
  return values.items.map((item, index) => {
    const parsed = calculationItems[index];
    return {
      description: item.description,
      quantity: parsed?.quantity ?? 0,
      unit: emptyToNull(item.unit),
      unitCode: (item.unitCode === '' ? DEFAULT_UNIT_CODE : item.unitCode) as UnitCode,
      unitPriceCents: parsed?.unitPriceCents ?? 0,
      discountType: item.discountType,
      discountValue: parsed?.discountValue ?? 0,
      taxRateBasisPoints: parsed?.taxRateBasisPoints ?? 0,
    };
  });
}

export function InvoicePreview({
  invoice,
  values,
  taxProfiles,
}: {
  invoice: InvoiceResponse;
  values: InvoiceFormValues;
  taxProfiles: TaxProfileResponse[];
}): JSX.Element {
  const company = useQuery({
    queryKey: queryKeys.company,
    queryFn: () => apiClient.get<CompanyResponse>('/company'),
  });

  const templateSettings = useQuery({
    queryKey: queryKeys.templateSettings,
    queryFn: () => apiClient.get<TemplateSettingsResponse>('/template-settings'),
  });

  if (company.data === undefined || templateSettings.data === undefined) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Vorschau wird geladen …
      </div>
    );
  }

  const selectedProfile =
    taxProfiles.find((profile) => String(profile.id) === values.taxProfileId) ?? null;

  const fallbackDate = toIsoDate(invoice.invoiceDate);

  /*
   * Bewusst ohne useMemo: React Hook Form verändert das Positionsarray an
   * Ort und Stelle, seine Referenz bleibt also gleich. Ein Memo darauf
   * ließe die Vorschau bei der zuletzt getippten Zeile stehen — derselbe
   * Fallstrick wie bei useInvoiceTotals.
   */
  const model = buildRenderModel({
    documentType: invoice.documentType,
    number: invoice.number,
    invoiceDate: asIsoDateOr(values.invoiceDate, fallbackDate),
    serviceDate: asIsoDateOr(values.serviceDate, fallbackDate),
    serviceDateTo: isValidIsoDate(values.serviceDateTo) ? values.serviceDateTo : null,
    dueDate: asIsoDateOr(values.dueDate, fallbackDate),
    currency: invoice.currency,
    seller: sellerSnapshotFromCompany(company.data),
    buyer: toBuyerData(values),
    tax: taxSnapshotFromProfile(selectedProfile),
    template: templateSnapshotFromSettings(templateSettings.data),
    notes: emptyToNull(values.notes),
    footerNote: emptyToNull(values.footerNote),
    // Im Browser genügt die Adresse des Assets; als Data-URI muss das Logo
    // erst für das PDF vorliegen, weil der Renderer die API nicht erreicht.
    logoSrc: company.data.logoUrl,
    items: toRenderItems(values),
  });

  return (
    <TemplateFrame css={CLASSIC_CSS} title="Vorschau der Rechnung">
      <ClassicTemplate model={model} />
    </TemplateFrame>
  );
}
