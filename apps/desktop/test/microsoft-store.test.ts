import { describe, expect, it, vi } from 'vitest';
import type { UpdateHost } from '@privatura/api/dist/app-update/update-host';
import { MicrosoftStoreUpdates } from '../src/update/microsoft-store';

describe('Microsoft-Store-Updates', () => {
  it('kann über keine API-Aktion den eigenen Updatekanal aktivieren', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Kein Netzwerk erwartet'));
    try {
      const host: UpdateHost = new MicrosoftStoreUpdates('1.2.3');
      for (const state of [
        host.status(),
        await host.check(),
        host.setAutomatic(true),
        await host.download(),
        host.cancelDownload(),
        await host.install(),
      ]) {
        expect(state).toMatchObject({
          state: 'microsoft-store',
          currentVersion: '1.2.3',
          automatic: false,
          feedUrl: null,
          available: null,
          ready: null,
          progress: null,
        });
      }
      expect(host.revealDownload()).toBe(false);
      expect(await host.openDownload()).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});
