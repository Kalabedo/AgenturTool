/**
 * Regeln für hochgeladene Dateien.
 *
 * Geteilt, damit das Frontend dieselben Grenzen anzeigt, die das Backend
 * durchsetzt — sonst erfährt man erst nach dem Upload, dass die Datei zu
 * groß war.
 */

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Erlaubte Logo-Formate.
 *
 * SVG ist bewusst nicht dabei: Eine SVG-Datei kann Skripte und externe
 * Referenzen enthalten und wird sowohl in der Browser-Vorschau als auch von
 * Chromium gerendert. Sie sicher zu verarbeiten hieße, sie zu bereinigen —
 * das ist eigener Aufwand und lohnt sich erst, wenn die Druckqualität eines
 * hochauflösenden PNG nicht ausreicht.
 */
export const LOGO_ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type LogoMimeType = (typeof LOGO_ALLOWED_MIME_TYPES)[number];

export const LOGO_ACCEPT_ATTRIBUTE = LOGO_ALLOWED_MIME_TYPES.join(',');

/**
 * Empfohlene Mindestbreite in Pixeln.
 *
 * Ein Logo von 40 mm Breite braucht für sauberen Druck bei 300 dpi rund
 * 470 px. Darunter wird es im PDF sichtbar unscharf.
 */
export const LOGO_RECOMMENDED_MIN_WIDTH_PX = 500;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
