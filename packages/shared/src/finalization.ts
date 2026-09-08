import { TAX_PROFILE_KIND, ZERO_TAX_KINDS, type TaxProfileKind } from './enums.js';
import type { BuyerData, SellerSnapshot, TaxSnapshot } from './snapshots.js';

/**
 * Die Prüfung vor dem Finalisieren (Abschnitt 8).
 *
 * Sie bildet die Pflichtangaben nach § 14 UStG ab — nicht mehr: Die
 * Anwendung ersetzt keine Rechtsberatung, und eine Prüfung, die mehr
 * verlangt als das Gesetz, hindert am Arbeiten.
 *
 * Bewusst hier im geteilten Paket und bewusst als Liste statt als „geht /
 * geht nicht": Das Backend weist damit die Finalisierung ab, und die
 * Oberfläche kann dieselbe Liste schon vorher anzeigen. Zwei getrennte
 * Implementierungen wären ein Versprechen, das die eine Seite bricht — man
 * klickt auf einen Knopf, der laut Anzeige gehen müsste.
 */

export interface FinalizationProblem {
  /** Feldpfad, passend zu den Feldnamen des Formulars. */
  field: string;
  message: string;
}

export interface FinalizationItem {
  description: string;
}

export interface FinalizationInput {
  seller: SellerSnapshot;
  buyer: BuyerData;
  tax: TaxSnapshot;
  items: FinalizationItem[];
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

/**
 * Alles, was der Finalisierung im Weg steht — leer heißt: kann ausgestellt
 * werden.
 */
export function checkFinalizable(input: FinalizationInput): FinalizationProblem[] {
  const problems: FinalizationProblem[] = [];
  const { seller, buyer, tax, items } = input;

  if (isBlank(seller.companyName)) {
    problems.push({
      field: 'seller.companyName',
      message: 'In den Einstellungen fehlt der eigene Firmenname.',
    });
  }

  if (
    isBlank(seller.address.street) ||
    isBlank(seller.address.postalCode) ||
    isBlank(seller.address.city)
  ) {
    problems.push({
      field: 'seller.address',
      message: 'Die eigene Anschrift ist unvollständig (Straße, PLZ und Ort).',
    });
  }

  // § 14 Abs. 4 Nr. 2: eines von beiden genügt, aber eines muss auf die
  // Rechnung.
  if (isBlank(seller.vatId) && isBlank(seller.taxNumber)) {
    problems.push({
      field: 'seller.taxNumber',
      message: 'Es fehlt die eigene Steuernummer oder USt-IdNr.',
    });
  }

  if (isBlank(buyer.companyName)) {
    problems.push({
      field: 'buyerData.companyName',
      message: 'Der Rechnungsempfänger hat keinen Namen.',
    });
  }

  if (
    isBlank(buyer.address.street) ||
    isBlank(buyer.address.postalCode) ||
    isBlank(buyer.address.city)
  ) {
    problems.push({
      field: 'buyerData.address',
      message: 'Die Anschrift des Empfängers ist unvollständig (Straße, PLZ und Ort).',
    });
  }

  if (isBlank(tax.profileName)) {
    problems.push({
      field: 'taxProfileId',
      message:
        'Ohne Steuerprofil steht auf der Rechnung weder ein Steuersatz noch ein Grund, warum keiner anfällt.',
    });
  } else if (ZERO_TAX_KINDS.includes(tax.kind as TaxProfileKind) && isBlank(tax.noteText)) {
    // Ohne Steuerausweis verlangt § 14 Abs. 4 Nr. 8 den Hinweis auf die
    // Steuerbefreiung. Ein leeres Feld hieße: Rechnung ohne Steuer und ohne
    // Begründung.
    problems.push({
      field: 'taxProfileId',
      message: `Das Steuerprofil „${tax.profileName}" weist keine Steuer aus, hat aber keinen Hinweistext.`,
    });
  }

  if (tax.kind === TAX_PROFILE_KIND.REVERSE_CHARGE) {
    if (isBlank(seller.vatId)) {
      problems.push({
        field: 'seller.vatId',
        message: 'Reverse Charge verlangt die eigene USt-IdNr.',
      });
    }
    if (isBlank(buyer.vatId)) {
      problems.push({
        field: 'vatId',
        message: 'Reverse Charge verlangt die USt-IdNr. des Empfängers.',
      });
    }
  }

  if (items.length === 0) {
    problems.push({ field: 'items', message: 'Die Rechnung hat keine Position.' });
  }

  items.forEach((item, index) => {
    if (isBlank(item.description)) {
      problems.push({
        field: `items.${index}.description`,
        message: `Position ${index + 1} hat keine Beschreibung.`,
      });
    }
  });

  return problems;
}

export function isFinalizable(input: FinalizationInput): boolean {
  return checkFinalizable(input).length === 0;
}

/**
 * Der Zustand, aus dem sich ergibt, ob „Finalisierung zurücknehmen" erlaubt
 * ist (Abschnitt 8).
 */
export interface UnfinalizeContext {
  status: string;
  /** Laufende Nummer der Rechnung innerhalb ihres Jahres. */
  numberSeq: number | null;
  /** Nächster freier Zählerstand desselben Jahres. */
  sequenceNextValue: number | null;
  sentAt: string | null;
  hasCancellation: boolean;
}

/**
 * Der Grund, der dem Zurücknehmen im Weg steht — `null` heißt: erlaubt.
 *
 * Alle vier Bedingungen aus Abschnitt 8, in der Reihenfolge, in der man sie
 * einem Benutzer erklären würde. Als Text und nicht als Code, weil die
 * Oberfläche den Knopf nur zeigt, wenn er zulässig ist, und sonst genau
 * diesen Satz danebenschreibt.
 */
export function unfinalizeBlocker(context: UnfinalizeContext): string | null {
  if (context.status === 'DRAFT') {
    return 'Diese Rechnung ist ein Entwurf.';
  }
  if (context.status === 'CANCELLED') {
    return 'Diese Rechnung ist storniert.';
  }
  if (context.status === 'PAID') {
    return 'Diese Rechnung ist als bezahlt vermerkt. Zuerst die Zahlung entfernen.';
  }
  if (context.hasCancellation) {
    return 'Zu dieser Rechnung gibt es ein Storno-Dokument.';
  }
  if (context.sentAt !== null) {
    // Was der Kunde in der Hand hat, wird nicht rückabgewickelt — dafür gibt
    // es das Storno.
    return 'Diese Rechnung ist als versendet vermerkt.';
  }
  if (
    context.numberSeq === null ||
    context.sequenceNextValue === null ||
    context.numberSeq !== context.sequenceNextValue - 1
  ) {
    // Der Kern der Regel: Nur die zuletzt gezogene Nummer geht zurück in die
    // Sequenz. Sonst entstünde genau die Lücke, die die späte Vergabe der
    // Nummer vermeiden soll.
    return 'Es gibt bereits eine neuere Rechnung in diesem Jahr; nur die zuletzt vergebene Nummer lässt sich zurückgeben.';
  }
  return null;
}
