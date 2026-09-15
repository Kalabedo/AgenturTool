import { describe, expect, it } from 'vitest';
import type { UpdateStatus } from '@privatura/shared';
import { bannerMode, shouldShowBanner } from '../src/features/updates/useUpdateStatus';

/**
 * Was das Banner in welchem Zustand zeigt.
 *
 * Daran hängen die Zusagen des ganzen Updatewegs: Es meldet eine neue
 * Fassung, es bleibt während des Downloads stehen, es fragt nach der
 * Installation — und es verschwindet auf „Später", bis es eine noch neuere
 * Fassung gibt. Ein Banner, das nach jedem Seitenwechsel wiederkommt, ist
 * keine Information mehr, sondern eine Aufforderung.
 */

function status(overrides: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    state: 'verfuegbar',
    currentVersion: '1.0.0',
    automatic: true,
    lastCheckedAt: '2026-09-13T08:00:00.000Z',
    available: {
      version: '1.4.0',
      releasedAt: '2026-09-13',
      notes: null,
      notesUrl: null,
      download: {
        url: 'https://updates.privatura.de/stable/Privatura-1.4.0-arm64.dmg',
        sizeBytes: 98_000_000,
        sha256: 'a'.repeat(64),
      },
    },
    progress: null,
    ready: null,
    error: null,
    feedUrl: 'https://updates.privatura.de/stable/updates.json',
    ...overrides,
  };
}

const READY: UpdateStatus['ready'] = {
  version: '1.4.0',
  filePath: '/Users/tom/Library/Application Support/Privatura/Updates/Privatura-1.4.0-arm64.dmg',
  sizeBytes: 98_000_000,
  installable: true,
};

describe('bannerMode', () => {
  it('meldet eine neue Fassung', () => {
    expect(bannerMode(status(), null)).toBe('verfuegbar');
  });

  it('zeigt den laufenden Download', () => {
    expect(
      bannerMode(
        status({
          state: 'laedt',
          progress: { transferredBytes: 49_000_000, totalBytes: 98_000_000, percent: 50 },
        }),
        null,
      ),
    ).toBe('laedt');
  });

  it('fragt nach der Installation, sobald das Paket bereit ist', () => {
    expect(bannerMode(status({ state: 'bereit', ready: READY }), null)).toBe('bereit');
  });

  it('bleibt während der Installation stehen', () => {
    expect(bannerMode(status({ state: 'installiert', ready: READY }), null)).toBe('installiert');
  });

  it('lässt einen laufenden Download nicht wegklicken', () => {
    // „Später" gilt für den Hinweis, nicht für einen Vorgang, den jemand
    // gerade angestoßen hat.
    expect(
      bannerMode(
        status({
          state: 'laedt',
          progress: { transferredBytes: 1, totalBytes: 98_000_000, percent: 0 },
        }),
        '1.4.0',
      ),
    ).toBe('laedt');
    expect(bannerMode(status({ state: 'bereit', ready: READY }), '1.4.0')).toBe('bereit');
  });

  it('zeigt einen Fehlschlag dort, wo gerade der Fortschritt stand', () => {
    expect(bannerMode(status({ state: 'fehler', error: 'Prüfsumme falsch.' }), null)).toBe(
      'fehler',
    );
  });

  it('schweigt bei einer gescheiterten Prüfung ohne Fund', () => {
    // Die hat niemand ausgelöst; sie gehört in die Einstellungen.
    expect(bannerMode(status({ state: 'fehler', available: null, error: 'kein Netz' }), null)).toBe(
      'kein',
    );
  });

  it('schweigt, solange nichts geladen ist', () => {
    expect(bannerMode(undefined, null)).toBe('kein');
  });

  it('schweigt bei allen übrigen Zuständen', () => {
    for (const state of ['aktuell', 'prueft', 'abgeschaltet', 'nicht-unterstuetzt'] as const) {
      expect(bannerMode(status({ state, available: null }), null)).toBe('kein');
    }
  });

  it('bleibt weg, wenn diese Fassung weggeklickt wurde', () => {
    expect(bannerMode(status(), '1.4.0')).toBe('kein');
    expect(shouldShowBanner(status(), '1.4.0')).toBe(false);
  });

  it('kommt bei der nächsten Fassung wieder', () => {
    expect(shouldShowBanner(status(), '1.3.0')).toBe(true);
  });
});
