import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button.js';
import {
  readDismissedVersion,
  shouldShowBanner,
  useDownloadUpdate,
  useUpdateStatus,
  writeDismissedVersion,
} from './useUpdateStatus.js';

/**
 * „Es gibt eine neue Fassung."
 *
 * Ein schmaler Streifen über der Kopfzeile, kein Dialog: Wer gerade eine
 * Rechnung schreibt, soll weiterschreiben können. Er erscheint nur, wenn
 * es wirklich etwas Neueres gibt, und verschwindet auf „Später" bis zur
 * übernächsten Fassung.
 *
 * „Update laden" öffnet den Browser des Rechners. Die Anwendung lädt und
 * installiert nichts selbst — sie sagt Bescheid, und die Installation ist
 * dieselbe wie beim ersten Mal (D41).
 */
export function UpdateBanner(): JSX.Element | null {
  const status = useUpdateStatus();
  const download = useDownloadUpdate();
  const [dismissed, setDismissed] = useState<string | null>(() => readDismissedVersion());

  if (!shouldShowBanner(status.data, dismissed)) return null;

  const available = status.data?.available;
  if (available === undefined || available === null) return null;

  return (
    <div className="border-b border-border bg-surface-raised">
      <div className="mx-auto flex max-w-[104rem] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <p className="text-sm text-ink">
          <span className="font-medium">AgenturTool {available.version} ist verfügbar</span>
          {available.notes !== null && <span className="text-ink-muted"> · {available.notes}</span>}
        </p>

        <div className="ml-auto flex items-center gap-2">
          {/* Der Weg zu den Einzelheiten: Prüfsumme, Größe, Datum. Wer dem
              Knopf nicht blind folgen will, findet dort, was er vergleichen
              kann. */}
          <Link
            to="/settings/updates"
            className="rounded-md px-2.5 py-1 text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Was ist neu?
          </Link>
          <Button
            size="sm"
            onClick={() => download.mutate()}
            pending={download.isPending}
            pendingLabel="öffnet …"
          >
            Update laden
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              writeDismissedVersion(available.version);
              setDismissed(available.version);
            }}
          >
            Später
          </Button>
        </div>
      </div>
    </div>
  );
}
