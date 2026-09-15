/**
 * Schmaler HTTP-Client für die eigene API.
 *
 * Bewusst ohne Bibliothek: Die API ist gleichnamig, gleichbasiert und
 * liefert ein einheitliches Fehlerformat. Was hier fehlt — Interceptors,
 * Retry-Strategien — übernimmt TanStack Query.
 */

export interface ApiErrorDetail {
  field: string;
  message: string;
}

/** Fehler mit dem Domänencode aus der API, damit die UI gezielt reagieren kann. */
export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** Feldbezogene Meldungen, um sie im Formular an der richtigen Stelle zu zeigen. */
  fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const detail of this.details ?? []) {
      if (detail.field !== '') result[detail.field] = detail.message;
    }
    return result;
  }
}

/**
 * Meldet dem Rest der Anwendung, dass die Sitzung abgelaufen ist.
 *
 * Der Client kennt weder React noch den Query-Zwischenspeicher, deshalb der
 * Umweg über ein Fensterereignis: Wer sich dafür interessiert — der
 * AuthGate — hört zu und fragt die Sitzung neu ab. Ohne das bliebe nach dem
 * Ablauf eine Oberfläche stehen, in der jede Aktion still fehlschlägt.
 */
export const SESSION_EXPIRED_EVENT = 'privatura:session-expired';

async function toError(response: Response): Promise<ApiRequestError> {
  if (response.status === 401) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }

  let code = 'INTERNAL_ERROR';
  let message = `Die Anfrage ist fehlgeschlagen (HTTP ${response.status}).`;
  let details: ApiErrorDetail[] | undefined;

  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: ApiErrorDetail[] };
    };
    if (body.error?.code !== undefined) code = body.error.code;
    if (body.error?.message !== undefined) message = body.error.message;
    if (Array.isArray(body.error?.details)) details = body.error.details;
  } catch {
    // Antwort ohne JSON-Körper — die Vorbelegung oben bleibt stehen.
  }

  return new ApiRequestError(code, message, response.status, details);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Eine heruntergeladene Datei samt dem Namen, den der Server vorgibt. */
export interface DownloadedFile {
  blob: Blob;
  filename: string;
  /**
   * Antwortkopfzeilen — für Downloads, die nebenbei etwas mitteilen.
   *
   * Das Abrechnen der Zeiterfassung ist so ein Fall: Der Rumpf ist der
   * Zeitnachweis, aber die Oberfläche muss auch erfahren, welche Einträge
   * dabei markiert wurden, um das rückgängig machen zu können.
   */
  headers: Headers;
}

/**
 * Liest den Dateinamen aus dem Content-Disposition-Header.
 *
 * Bevorzugt `filename*` (RFC 5987, prozentkodiert) — nur dort kommen
 * Umlaute unverfälscht an; `filename` ist der ASCII-Rückfall.
 */
function filenameFrom(header: string | null, fallback: string): string {
  if (header === null) return fallback;

  const encoded = /filename\*=UTF-8''([^;]+)/iu.exec(header);
  if (encoded?.[1] !== undefined) return decodeURIComponent(encoded[1]);

  const plain = /filename="([^"]+)"/u.exec(header);
  return plain?.[1] ?? fallback;
}

async function requestFile(
  path: string,
  fallbackName: string,
  init?: RequestInit,
): Promise<DownloadedFile> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) throw await toError(response);

  return {
    blob: await response.blob(),
    filename: filenameFrom(response.headers.get('Content-Disposition'), fallbackName),
    headers: response.headers,
  };
}

export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>(path),

  put: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  patch: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  post: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),

  /** Datei-Download: die Antwort ist ein PDF und darf nicht durch JSON.parse. */
  download: (path: string, fallbackName: string): Promise<DownloadedFile> =>
    requestFile(path, fallbackName),

  /** Wie `download`, aber mit einer Nutzlast — für PDFs aus Formulardaten. */
  downloadFromPost: (path: string, body: unknown, fallbackName: string): Promise<DownloadedFile> =>
    requestFile(path, fallbackName, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /** Datei-Upload: kein Content-Type setzen, der Browser ergänzt die Boundary. */
  upload: <T>(path: string, file: File, fieldName = 'file'): Promise<T> => {
    const formData = new FormData();
    formData.append(fieldName, file);
    return request<T>(path, { method: 'POST', body: formData });
  },
};
