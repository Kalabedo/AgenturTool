import { z } from 'zod';

/**
 * Die Umsatzgrenzen der Kleinunternehmerregelung (§ 19 UStG).
 *
 * Seit 2025 gelten zwei Zahlen, und die zweite ist die gefährliche: Wird sie
 * im laufenden Jahr überschritten, endet die Regelung **sofort** — die
 * nächste Rechnung trägt Umsatzsteuer, nicht erst die im Januar. Wer das
 * übersieht, stellt den Rest des Jahres Rechnungen ohne Steuer aus und
 * schuldet sie dem Finanzamt trotzdem.
 *
 * Deshalb steht das hier: nicht als Steuerlogik, sondern als Vergleich
 * zweier Zahlen mit einem Hinweis davor. Die Anwendung rechnet nach und
 * sagt Bescheid; **ob und wann das Steuerprofil gewechselt wird, entscheidet
 * der Steuerberater.**
 *
 * Die Grenzwerte liegen wie das Nummernmuster in `AppSetting` und nicht im
 * Code (dieselbe Regel wie bei den Steuerprofilen, Abschnitt 10). Ändert der
 * Gesetzgeber sie, ist das eine Einstellung und kein neues Release.
 */

/** Schlüssel, unter dem die Grenzwerte in `AppSetting` liegen. */
export const SMALL_BUSINESS_LIMITS_SETTING_KEY = 'smallBusiness.limits';

export const smallBusinessLimitsSchema = z.object({
  /**
   * Vorjahresumsatz, bis zu dem die Regelung im Folgejahr gilt.
   * Seit 2025: 25.000 €.
   */
  previousYearCents: z.number().int().positive(),
  /**
   * Umsatz des laufenden Jahres, bei dessen Überschreiten die Regelung
   * sofort endet. Seit 2025: 100.000 €.
   */
  currentYearCents: z.number().int().positive(),
  /**
   * Ab welchem Anteil der laufenden Grenze ein Hinweis erscheint.
   *
   * „Rechtzeitig warnen, nicht erst beim Überschreiten" — bei 100 % wäre der
   * Hinweis eine Nachricht über etwas, das nicht mehr zu ändern ist.
   */
  warnAtPercent: z.number().int().min(1).max(100),
});
export type SmallBusinessLimits = z.infer<typeof smallBusinessLimitsSchema>;

/** Die Werte des § 19 UStG in der seit 2025 geltenden Fassung. */
export const DEFAULT_SMALL_BUSINESS_LIMITS: SmallBusinessLimits = {
  previousYearCents: 2_500_000,
  currentYearCents: 10_000_000,
  warnAtPercent: 80,
};

/**
 * Wie die laufende Rechnung zu der Grenze steht.
 *
 * Deutsche Werte, weil sie wie `UpdateState` und `BackupReason` unmittelbar
 * in der Oberfläche landen.
 */
export const SMALL_BUSINESS_STATE = {
  /** Weit genug entfernt — es gibt nichts zu sagen. */
  RUHIG: 'ruhig',
  /** Der Hinweis steht auf dem Dashboard. */
  NAHE: 'nahe',
  /** Die Grenze ist gerissen; die Regelung endet im laufenden Jahr. */
  UEBERSCHRITTEN: 'ueberschritten',
} as const;
export type SmallBusinessState =
  (typeof SMALL_BUSINESS_STATE)[keyof typeof SMALL_BUSINESS_STATE];

export interface SmallBusinessYear {
  year: number;
  /** Summe der ausgestellten Rechnungen abzüglich Stornos, in Cent. */
  revenueCents: number;
  limitCents: number;
  /** Was bis zur Grenze bleibt; negativ, wenn sie gerissen ist. */
  remainingCents: number;
  state: SmallBusinessState;
}

export interface SmallBusinessStatus {
  /**
   * `false`, wenn es gar kein Kleinunternehmerprofil gibt. Dann zeigt die
   * Oberfläche nichts — die Regelung geht denjenigen nichts an, der sie
   * nicht nutzt.
   */
  applicable: boolean;
  limits: SmallBusinessLimits;
  current: SmallBusinessYear;
  previous: SmallBusinessYear;
}

/**
 * Die Auskunft vor dem Ausstellen einer einzelnen Rechnung.
 *
 * `breaches` ist `false`, solange nichts zu sagen ist — der Normalfall, und
 * damit auch der Fall, in dem der Dialog unverändert aussieht.
 */
export interface SmallBusinessInvoiceWarning {
  /** Betrifft die Regelung diese Rechnung überhaupt? */
  applicable: boolean;
  breaches: boolean;
  /** Jahresumsatz vor dieser Rechnung. */
  revenueBeforeCents: number;
  /** Jahresumsatz, wenn sie ausgestellt wird. */
  revenueAfterCents: number;
  limitCents: number;
  /** Um wie viel die Grenze überschritten würde; 0, wenn nicht. */
  exceedsByCents: number;
}

/**
 * Stuft einen Jahresumsatz gegen seine Grenze ein.
 *
 * Bewusst auf Cent genau und ohne Toleranz: Die Grenze ist erreicht, wenn
 * der Umsatz sie erreicht. Ein „ungefähr" gäbe es im Gesetz nicht.
 */
export function classifyRevenue(
  revenueCents: number,
  limitCents: number,
  warnAtPercent: number,
): SmallBusinessState {
  if (revenueCents > limitCents) return SMALL_BUSINESS_STATE.UEBERSCHRITTEN;

  // Ganzzahlig vergleichen statt über Prozentwerte zu rechnen: Bei 80 % von
  // 100.000 € liefe der Umweg über eine Division sonst in Fließkomma.
  const threshold = (limitCents * warnAtPercent) / 100;
  return revenueCents >= threshold ? SMALL_BUSINESS_STATE.NAHE : SMALL_BUSINESS_STATE.RUHIG;
}

export function toSmallBusinessYear(
  year: number,
  revenueCents: number,
  limitCents: number,
  warnAtPercent: number,
): SmallBusinessYear {
  return {
    year,
    revenueCents,
    limitCents,
    remainingCents: limitCents - revenueCents,
    state: classifyRevenue(revenueCents, limitCents, warnAtPercent),
  };
}

/**
 * Was eine noch nicht ausgestellte Rechnung an der Lage ändern würde.
 *
 * Gefragt wird vor dem Ausstellen, denn danach ist es zu spät: Die Nummer
 * ist gezogen, das Dokument eingefroren, und eine Rechnung ohne
 * ausgewiesene Steuer lässt sich nicht nachträglich zu einer mit machen.
 *
 * Gibt `null` zurück, wenn es nichts zu sagen gibt — der Normalfall, und
 * deshalb der Rückgabewert, auf den der Aufrufer prüft.
 */
export function limitBreachByInvoice(input: {
  revenueCents: number;
  invoiceNetCents: number;
  limitCents: number;
}): { revenueAfterCents: number; exceedsByCents: number } | null {
  const revenueAfterCents = input.revenueCents + input.invoiceNetCents;
  if (revenueAfterCents <= input.limitCents) return null;

  return {
    revenueAfterCents,
    exceedsByCents: revenueAfterCents - input.limitCents,
  };
}
