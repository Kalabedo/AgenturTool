import { LOGO_ALLOWED_MIME_TYPES, type LogoMimeType } from '@privatura/shared';

/**
 * Bestimmt den Bildtyp anhand der Signatur am Dateianfang.
 *
 * Der vom Browser gemeldete Content-Type und die Dateiendung sind beide frei
 * wählbar. Wer eine Datei hochlädt, kann sie "logo.png" nennen und als
 * image/png deklarieren, obwohl etwas ganz anderes drinsteht. Verlässlich
 * ist nur der tatsächliche Inhalt.
 */
export function detectImageMimeType(buffer: Buffer): LogoMimeType | null {
  if (buffer.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: "RIFF" .... "WEBP"
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }

  return null;
}

export function isAllowedLogoType(mimeType: string): mimeType is LogoMimeType {
  return (LOGO_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

const EXTENSIONS: Record<LogoMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function extensionFor(mimeType: LogoMimeType): string {
  return EXTENSIONS[mimeType];
}
