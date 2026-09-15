import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatBytes } from '@privatura/shared';
import { ApiRequestError } from '../../lib/apiClient.js';
import { Button } from '../../components/ui/Button.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import {
  bannerMode,
  readDismissedVersion,
  useCancelDownload,
  useDownloadUpdate,
  useInstallUpdate,
  useUpdateStatus,
  writeDismissedVersion,
} from './useUpdateStatus.js';

/**
 * Der Updateweg, wie er im Fenster erscheint.
 *
 * Ein schmaler Streifen über der Kopfzeile, kein Dialog: Wer gerade eine
 * Rechnung schreibt, soll weiterschreiben können. Er wechselt mit dem
 * Zustand und führt in genau einer Richtung weiter:
 *
 * > Privatura 1.4 ist verfügbar · Was ist neu? · **Update laden** · Später
 * > Lädt Privatura 1.4 … 62 % von 98 MB · Abbrechen
 * > Privatura 1.4 ist bereit · **Neu starten und installieren** · Später
 *
 * Jeder Schritt braucht seinen Klick. Vor dem Neustart fragt ein Dialog
 * nach — er ist die einzige Stelle des Programms, an der eine Handlung das
 * Fenster schließt, und ungespeicherte Änderungen in einem Entwurf gehen
 * dabei verloren (D41).
 */
export function UpdateBanner(): JSX.Element | null {
  const status = useUpdateStatus();
  const download = useDownloadUpdate();
  const cancel = useCancelDownload();
  const install = useInstallUpdate();
  const [dismissed, setDismissed] = useState<string | null>(() => readDismissedVersion());
  const [asking, setAsking] = useState(false);
  /*
   * Ab dem Klick auf „Installieren" gilt: Die Anwendung beendet sich. Die
   * Anfrage bleibt dabei ohne Antwort, und die Zustandsabfrage läuft ins
   * Leere — beides ist hier das erwartete Ende und kein Fehler. Nur wenn
   * der Server ausdrücklich antwortet, dass nichts geschehen ist, geht es
   * zurück.
   */
  const [restarting, setRestarting] = useState(false);

  const mode = restarting ? 'installiert' : bannerMode(status.data, dismissed);
  if (mode === 'kein' || status.data === undefined) return null;

  const current = status.data;
  const version = current.ready?.version ?? current.available?.version ?? current.currentVersion;

  const later = (): void => {
    writeDismissedVersion(version);
    setDismissed(version);
  };

  return (
    <div className="border-b border-border bg-surface-raised">
      <div className="mx-auto flex max-w-[104rem] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <p className="text-sm text-ink">
          {mode === 'verfuegbar' && (
            <>
              <span className="font-medium">Privatura {version} ist verfügbar</span>
              {current.available?.notes !== null && current.available?.notes !== undefined && (
                <span className="text-ink-muted"> · {current.available.notes}</span>
              )}
            </>
          )}

          {mode === 'laedt' && (
            <>
              <span className="font-medium">Privatura {version} wird geladen</span>
              {current.progress !== null && (
                <span className="tabular-nums text-ink-muted">
                  {' '}
                  · {current.progress.percent} % von {formatBytes(current.progress.totalBytes)}
                </span>
              )}
            </>
          )}

          {mode === 'bereit' && (
            <>
              <span className="font-medium">Privatura {version} ist bereit</span>
              <span className="text-ink-muted">
                {' '}
                ·{' '}
                {/* Ein gescheiterter Versuch lässt das Paket bereit liegen.
                    Dann steht hier, woran es lag, statt derselben
                    Einladung wie zuvor. */}
                {current.error ?? 'Vor der Installation wird automatisch ein Backup erstellt.'}
              </span>
            </>
          )}

          {mode === 'installiert' && (
            <span className="font-medium">
              Privatura {version} wird installiert — die Anwendung startet gleich neu …
            </span>
          )}

          {mode === 'fehler' && (
            <>
              <span className="font-medium">Das Update ist nicht durchgelaufen</span>
              {current.error !== null && <span className="text-ink-muted"> · {current.error}</span>}
            </>
          )}
        </p>

        {/* Der Balken läuft unter der Zeile durch, nicht daneben: Er soll die
            Knöpfe nicht bei jedem Prozent verschieben. */}
        {mode === 'laedt' && current.progress !== null && (
          <div
            role="progressbar"
            aria-label={`Download von Privatura ${version}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={current.progress.percent}
            className="order-last h-1 w-full overflow-hidden rounded-full bg-surface-sunken"
          >
            <div
              className="h-full bg-inverse transition-[width] duration-500"
              style={{ width: `${current.progress.percent}%` }}
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Der Weg zu den Einzelheiten: Prüfsumme, Größe, Datum. Wer dem
              Knopf nicht blind folgen will, findet dort, was er vergleichen
              kann. */}
          {mode !== 'installiert' && (
            <Link
              to="/settings/updates"
              className="rounded-md px-2.5 py-1 text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {mode === 'verfuegbar' ? 'Was ist neu?' : 'Einzelheiten'}
            </Link>
          )}

          {mode === 'verfuegbar' && (
            <Button
              size="sm"
              onClick={() => download.mutate()}
              pending={download.isPending}
              pendingLabel="startet …"
            >
              Update laden
            </Button>
          )}

          {mode === 'laedt' && (
            <Button size="sm" variant="secondary" onClick={() => cancel.mutate()}>
              Abbrechen
            </Button>
          )}

          {mode === 'bereit' && (
            <Button size="sm" onClick={() => setAsking(true)} pending={install.isPending}>
              Neu starten und installieren
            </Button>
          )}

          {mode === 'fehler' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => download.mutate()}
              pending={download.isPending}
              pendingLabel="startet …"
            >
              Erneut versuchen
            </Button>
          )}

          {mode !== 'installiert' && (
            <Button size="sm" variant="ghost" onClick={later}>
              Später
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={asking}
        title={`Privatura ${version} installieren?`}
        description={
          'Die Anwendung erstellt ein Backup, installiert die neue Fassung und ' +
          'startet neu. Ungespeicherte Änderungen in einem Rechnungsentwurf gehen ' +
          'dabei verloren — schließe sie vorher ab.'
        }
        confirmLabel="Neu starten und installieren"
        isPending={install.isPending}
        pendingLabel="wird installiert …"
        onConfirm={() => {
          setAsking(false);
          setRestarting(true);
          install.mutate(undefined, {
            onSuccess: (result) => {
              if (result.state !== 'installiert') setRestarting(false);
            },
            onError: (error) => {
              // Ein Abbruch der Verbindung heißt „die Anwendung geht
              // gerade". Nur eine echte Antwort der API nimmt die
              // Ankündigung zurück.
              if (error instanceof ApiRequestError) setRestarting(false);
            },
          });
        }}
        onClose={() => setAsking(false)}
      />
    </div>
  );
}
