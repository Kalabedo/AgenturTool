/**
 * Die Konfiguration der Desktop-Anwendung.
 *
 * Drei Werte aus der Umgebung; die ersten beiden brauchen eine Prüfung.
 *
 * Beim Zeitlimit, weil `Number('dreißig')` gleich `NaN` ist und ein
 * Zeitlimit von `NaN` in `setTimeout` sofort abbricht — jedes PDF schlüge
 * fehl, und die Meldung spräche von einem Zeitlimit, das niemand gesetzt
 * zu haben glaubt. Diese Prüfung stand früher in `ChromiumConfig` und ist
 * mit Puppeteer verschwunden; hier ist ihr neuer Ort.
 *
 * Beim Updatefeed, weil dort die einzige Adresse steht, mit der diese
 * Anwendung von sich aus spricht (D43). Ein Tippfehler darf sie nicht
 * irgendwohin zeigen lassen.
 *
 * Der dritte ist ein Schalter für die Rauchprobe und sonst nichts.
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 300_000;

/** Zeitlimit für einen Renderlauf, aus `PDF_TIMEOUT_MS`. */
export function pdfTimeoutMs(raw: string | undefined = process.env.PDF_TIMEOUT_MS): number {
  if (raw === undefined || raw === '') {
    return DEFAULT_TIMEOUT_MS;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    throw new Error(
      `PDF_TIMEOUT_MS muss eine ganze Zahl zwischen ${String(MIN_TIMEOUT_MS)} und ` +
        `${String(MAX_TIMEOUT_MS)} sein (erhalten: ${raw}).`,
    );
  }
  return value;
}

/**
 * Die Adresse des Updatefeeds.
 *
 * Fest im Programm und nicht in einer Datei daneben: Wer sie ändern kann,
 * bestimmt, woher diese Anwendung ihre Installer bezieht. Die Umgebung
 * darf sie trotzdem ersetzen — das ist der Weg, den Updatepfad gegen eine
 * Testdomain zu prüfen, bevor ein Release herausgeht.
 */
export const DEFAULT_UPDATE_FEED_URL = 'https://updates.agenturtool.de/stable/updates.json';

/**
 * Die Hosts, von denen Downloads und Hinweisseiten stammen dürfen.
 *
 * Der Feed nennt vollständige Adressen; ohne diese Liste könnte ein
 * veränderter Feed auf ein beliebiges Paket zeigen. Sie ist deshalb kurz
 * und gehört zur Anwendung, nicht zum Feed.
 */
const DEFAULT_UPDATE_HOSTS = ['updates.agenturtool.de', 'agenturtool.de', 'www.agenturtool.de'];

export interface UpdateFeedConfig {
  /** Die Feed-Adresse — `null`, wenn die Prüfung abgeschaltet ist. */
  url: string | null;
  /** Erlaubte Hosts für Downloads und Hinweisseiten. */
  allowedHosts: readonly string[];
}

/**
 * Was aus `AGENTUR_TOOL_UPDATE_FEED` folgt.
 *
 * Leer heißt: die eingebaute Adresse. `aus` schaltet die Prüfung ganz ab —
 * das braucht die Rauchprobe, die belegen soll, dass beim Start nichts den
 * Rechner verlässt. Alles andere muss eine HTTPS-Adresse sein und gilt
 * dann auch als einziger erlaubter Host; eine Testdomain soll nicht
 * nebenbei die Produktionsadressen mit freischalten.
 */
export function updateFeedConfig(
  raw: string | undefined = process.env.AGENTUR_TOOL_UPDATE_FEED,
): UpdateFeedConfig {
  if (raw === undefined || raw.trim() === '') {
    return { url: DEFAULT_UPDATE_FEED_URL, allowedHosts: DEFAULT_UPDATE_HOSTS };
  }

  const value = raw.trim();
  if (value === 'aus' || value === 'off') {
    return { url: null, allowedHosts: [] };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `AGENTUR_TOOL_UPDATE_FEED muss „aus" oder eine HTTPS-Adresse sein (erhalten: ${value}).`,
    );
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`AGENTUR_TOOL_UPDATE_FEED muss HTTPS sein (erhalten: ${value}).`);
  }

  return { url: parsed.toString(), allowedHosts: [parsed.hostname] };
}

/**
 * Soll die Tagessicherung sofort und ohne Drossel laufen?
 *
 * Nur für die Rauchprobe, die die gepackte Anwendung für ein paar Sekunden
 * startet: Eine Minute Wartezeit erlebt sie nie, und das Archiv desselben
 * Tages liegt zu diesem Zeitpunkt längst da. Ohne diesen Schalter bliebe
 * die automatische Sicherung genau dort ungeprüft, wo sich die
 * Modulauflösung vom Repository unterscheidet — im Paket.
 *
 * Absichtlich ohne Fehlermeldung bei unbekanntem Wert: Ein Schalter, der
 * nur „an" kennt, kann nichts falsch verstehen, und ein Start darf daran
 * nicht scheitern.
 */
export function forcedDailyBackup(
  raw: string | undefined = process.env.AGENTUR_TOOL_BACKUP_TAEGLICH,
): boolean {
  return raw?.trim() === 'erzwingen';
}
