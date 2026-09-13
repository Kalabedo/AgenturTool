import { describe, expect, it } from 'vitest';
import type { UpdateStatus } from '@agentur-tool/shared';
import { shouldShowBanner } from '../src/features/updates/useUpdateStatus';

/**
 * Wann das Updatebanner erscheint.
 *
 * Die beiden Zusagen, an denen es hängt: Es erscheint, wenn es wirklich
 * etwas Neueres gibt — und es bleibt weg, wenn jemand „Später" geklickt
 * hat. Ein Banner, das nach jedem Seitenwechsel wiederkommt, ist keine
 * Information mehr, sondern eine Aufforderung.
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
      download: null,
    },
    error: null,
    feedUrl: 'https://updates.agenturtool.de/stable/updates.json',
    ...overrides,
  };
}

describe('shouldShowBanner', () => {
  it('zeigt eine neue Fassung', () => {
    expect(shouldShowBanner(status(), null)).toBe(true);
  });

  it('schweigt, solange nichts geladen ist', () => {
    expect(shouldShowBanner(undefined, null)).toBe(false);
  });

  it('schweigt bei allen übrigen Zuständen', () => {
    for (const state of ['aktuell', 'prueft', 'fehler', 'abgeschaltet', 'nicht-unterstuetzt']) {
      expect(
        shouldShowBanner(status({ state: state as UpdateStatus['state'], available: null }), null),
      ).toBe(false);
    }
  });

  it('bleibt weg, wenn diese Fassung weggeklickt wurde', () => {
    expect(shouldShowBanner(status(), '1.4.0')).toBe(false);
  });

  it('kommt bei der nächsten Fassung wieder', () => {
    expect(shouldShowBanner(status(), '1.3.0')).toBe(true);
  });
});
