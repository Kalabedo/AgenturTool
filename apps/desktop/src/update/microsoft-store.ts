import type { UpdateStatus } from '@privatura/shared';
import type { UpdateHost } from '@privatura/api/dist/app-update/update-host';

/** Store-Pakete beziehen keine Installer aus dem eigenen Updatefeed. */
export class MicrosoftStoreUpdates implements UpdateHost {
  constructor(private readonly currentVersion: string) {}

  status(): UpdateStatus {
    return {
      state: 'microsoft-store',
      currentVersion: this.currentVersion,
      automatic: false,
      lastCheckedAt: null,
      available: null,
      progress: null,
      ready: null,
      error: null,
      feedUrl: null,
    };
  }

  check(): Promise<UpdateStatus> {
    return Promise.resolve(this.status());
  }

  setAutomatic(): UpdateStatus {
    return this.status();
  }

  download(): Promise<UpdateStatus> {
    return this.check();
  }

  cancelDownload(): UpdateStatus {
    return this.status();
  }

  install(): Promise<UpdateStatus> {
    return this.check();
  }

  revealDownload(): boolean {
    return false;
  }

  openDownload(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
