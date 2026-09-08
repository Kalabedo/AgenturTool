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

async function toError(response: Response): Promise<ApiRequestError> {
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

  /** Datei-Upload: kein Content-Type setzen, der Browser ergänzt die Boundary. */
  upload: <T>(path: string, file: File, fieldName = 'file'): Promise<T> => {
    const formData = new FormData();
    formData.append(fieldName, file);
    return request<T>(path, { method: 'POST', body: formData });
  },
};
