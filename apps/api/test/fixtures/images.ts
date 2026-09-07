/**
 * Kleinste gültige Bilddateien als Testdaten.
 *
 * Als Base64 eingebettet statt als Binärdateien im Repo: So ist im Diff
 * sichtbar, was sich ändert, und ein Test kann nicht daran scheitern, dass
 * eine Datei beim Auschecken verändert wurde.
 */

/** 1×1 Pixel PNG, transparent. */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** 1×1 Pixel JPEG. */
export const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

/** 1×1 Pixel WebP (lossy). */
export const WEBP_1PX = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
  'base64',
);

/** Eine Datei, die kein Bild ist — auch wenn sie "logo.png" heißt. */
export const NOT_AN_IMAGE = Buffer.from('Dies ist reiner Text und kein Bild.', 'utf8');
