import { z } from 'zod';

/**
 * Seitenweises Blättern.
 *
 * Eine eigene Hülle statt eines nackten Arrays, weil die Oberfläche zwei
 * Dinge braucht, die im Array nicht stehen: wie viele Datensätze es
 * insgesamt gibt und auf welcher Seite man gerade ist. „87 Rechnungen, Seite
 * 2 von 4" lässt sich sonst nicht anzeigen, und ein Zähler, den das Frontend
 * schätzt, ist falsch, sobald gefiltert wird.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export interface PaginatedResponse<T> {
  items: T[];
  /** Treffer insgesamt, nicht nur auf dieser Seite. */
  total: number;
  page: number;
  pageSize: number;
  /** Anzahl der Seiten; bei null Treffern 0. */
  pageCount: number;
}

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResponse<T> {
  return { items, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}

/** „1–25 von 87" — die Zeile unter einer Liste. */
export function describeRange(
  result: Pick<PaginatedResponse<unknown>, 'items' | 'total' | 'page' | 'pageSize'>,
): string {
  if (result.total === 0) return 'keine Treffer';

  const from = (result.page - 1) * result.pageSize + 1;
  return `${from}–${from + result.items.length - 1} von ${result.total}`;
}
