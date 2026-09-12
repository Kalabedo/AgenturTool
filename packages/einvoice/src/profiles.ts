/**
 * Die Profile, in denen eine E-Rechnung ausgegeben werden kann.
 *
 * Aufgebaut wie `registry.ts` im Template-Paket, und aus demselben Grund:
 * Was heute eine einzige Auswahl ist, wird morgen eine zweite.
 *
 * Und zwar absehbar. XRechnung 3.0.2 ist die geltende Fassung, **4.0 ist
 * für Mitte bis Ende 2026 angekündigt** und setzt die überarbeitete
 * EN 16931-1:2026 um. Ein fest verdrahtetes Profil wäre innerhalb eines
 * Jahres Altlast (D-E6).
 *
 * Ein Profil ist hier nicht mehr als eine Kennung: Die Syntax — CII, also
 * UN/CEFACT Cross Industry Invoice in der Fassung D16B — ist bei
 * XRechnung, ZUGFeRD und Factur-X dieselbe. Das ist kein Zufall, sondern
 * der Grund, warum dieselbe Abbildung später für ZUGFeRD reicht: Dort
 * wandert genau dieses XML in die PDF-Datei.
 */

export interface EinvoiceProfile {
  /** Schlüssel für Aufrufe und Ablage. */
  key: string;
  /** Was in der Oberfläche steht. */
  label: string;
  /**
   * BT-24: die Kennung der Spezifikation, wie sie ins Dokument geschrieben
   * wird. Daran erkennt ein Prüfwerkzeug, gegen welche Regeln es prüft.
   */
  specificationId: string;
  /**
   * BT-23: die Kennung des Geschäftsprozesses.
   *
   * In XRechnung Pflicht. Der Wert benennt den Rechnungsprozess von
   * Peppol; ein anderer käme erst infrage, wenn der Empfänger einen
   * eigenen Prozess vorgibt.
   */
  businessProcessId: string | null;
  /** Der Dateiname, unter dem die Datei üblicherweise verschickt wird. */
  fileSuffix: string;
  /**
   * Ob BT-10 (Käuferreferenz) Pflicht ist.
   *
   * Steht am Profil und nicht im Prüfcode, weil genau das der Unterschied
   * zwischen der EU-Norm und der deutschen Einschränkung ist — dieselbe
   * Linie wie bei den Steuerprofilen: die Regel als Angabe, nicht als
   * Sonderfall im Ablauf.
   */
  requiresBuyerReference: boolean;
}

export const XRECHNUNG_3_0: EinvoiceProfile = {
  key: 'xrechnung-3.0',
  label: 'XRechnung 3.0 (CII)',
  // Achtung: Mit Fassung 3.0 hat sich diese Kennung geändert — 2.x trug
  // noch `urn:xoev-de:kosit:standard:xrechnung_2.x`. Ein Dokument mit der
  // alten Kennung wird vom Prüfwerkzeug nicht etwa bemängelt, sondern gar
  // nicht erst als XRechnung erkannt („no scenario matched").
  specificationId: 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
  businessProcessId: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
  fileSuffix: '.xml',
  requiresBuyerReference: true,
};

/**
 * Die reine EU-Norm ohne nationale Einschränkung.
 *
 * Hier, weil sie für Empfänger außerhalb Deutschlands das richtige Profil
 * ist: XRechnung verlangt Felder, die die Norm freistellt — allen voran
 * die Käuferreferenz. Einem französischen Kunden eine XRechnung zu
 * schicken wäre nicht falsch, aber unnötig streng.
 */
export const EN16931_CII: EinvoiceProfile = {
  key: 'en16931-cii',
  label: 'EN 16931 (CII)',
  specificationId: 'urn:cen.eu:en16931:2017',
  // Die reine Norm verlangt BT-23 nicht.
  businessProcessId: null,
  fileSuffix: '.xml',
  requiresBuyerReference: false,
};

/**
 * Das Profil des XML, das in einem ZUGFeRD-PDF steckt.
 *
 * Inhaltlich dieselbe Kennung wie {@link EN16931_CII} — und das ist der
 * Punkt: ZUGFeRD ist kein eigenes XML-Format, sondern die EU-Norm in einer
 * PDF-Datei. Ein eigener Eintrag steht trotzdem hier, weil die Ablage
 * festhalten soll, wofür eine Datei erzeugt wurde, und weil `fileSuffix`
 * sich unterscheidet: Das Ergebnis ist ein PDF, keine XML-Datei.
 *
 * Dass die Käuferreferenz hier nicht verlangt wird, ist die praktische
 * Folge davon — und der Grund, warum ZUGFeRD für deutlich mehr Kunden
 * funktioniert als die XRechnung.
 */
export const ZUGFERD_EN16931: EinvoiceProfile = {
  key: 'zugferd-en16931',
  label: 'ZUGFeRD / Factur-X (EN 16931)',
  specificationId: 'urn:cen.eu:en16931:2017',
  businessProcessId: null,
  fileSuffix: '.pdf',
  requiresBuyerReference: false,
};

export const EINVOICE_PROFILES: readonly EinvoiceProfile[] = [
  XRECHNUNG_3_0,
  EN16931_CII,
  ZUGFERD_EN16931,
];

/** Das Profil, das ohne besondere Angabe benutzt wird. */
export const DEFAULT_EINVOICE_PROFILE = XRECHNUNG_3_0;

export function findProfile(key: string): EinvoiceProfile | null {
  return EINVOICE_PROFILES.find((profile) => profile.key === key) ?? null;
}
