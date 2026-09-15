import { useState } from 'react';
import { formatBytes, type UpdateStatus } from '@privatura/shared';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Checkbox } from '../../../components/ui/Checkbox.js';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog.js';
import { ErrorNotice } from '../../../components/ui/ErrorNotice.js';
import { LoadingNote } from '../../../components/ui/LoadingNote.js';
import { PageHeader } from '../../../components/ui/PageHeader.js';
import { StatusText } from '../../../components/ui/StatusText.js';
import { ApiRequestError } from '../../../lib/apiClient.js';
import { useDocumentTitle } from '../../../lib/useDocumentTitle.js';
import {
  useCancelDownload,
  useCheckForUpdate,
  useDownloadUpdate,
  useInstallUpdate,
  useOpenDownload,
  useRevealDownload,
  useUpdateSettings,
  useUpdateStatus,
} from '../../updates/useUpdateStatus.js';

/**
 * Version und Updates.
 *
 * Die Seite beantwortet vier Fragen, die sonst niemand beantwortet: Welche
 * Fassung läuft hier? Gibt es eine neuere? Was genau fragt diese Anwendung
 * dafür wen? Und was passiert, wenn ich auf „Installieren" klicke?
 *
 * Die dritte steht ausdrücklich dabei — eine Anwendung, die für sich in
 * Anspruch nimmt, den Rechner nicht zu verlassen, schuldet die Ausnahme im
 * Klartext (D43). Die vierte auch: Ein Knopf, der die Anwendung beendet,
 * muss vorher sagen, dass er das tut.
 */
export function UpdatePage(): JSX.Element {
  useDocumentTitle('Updates');

  const status = useUpdateStatus();
  const check = useCheckForUpdate();
  const settings = useUpdateSettings();
  const download = useDownloadUpdate();
  const cancel = useCancelDownload();
  const install = useInstallUpdate();
  const reveal = useRevealDownload();
  const openInBrowser = useOpenDownload();
  const [asking, setAsking] = useState(false);
  /** Siehe `UpdateBanner`: Der Verbindungsabbruch ist hier das Ziel. */
  const [restarting, setRestarting] = useState(false);

  const header = (
    <PageHeader title="Updates" description="Installierte Fassung und neue Versionen." />
  );

  if (status.isError) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorNotice
          error={status.error}
          title="Der Updatezustand konnte nicht gelesen werden."
          onRetry={() => void status.refetch()}
        />
      </div>
    );
  }

  if (status.data === undefined) {
    return (
      <div className="space-y-6">
        {header}
        <LoadingNote />
      </div>
    );
  }

  const current = status.data;
  /*
   * Der Fehler der Installation zählt nur, wenn er von der API kommt: Bricht
   * die Verbindung ab, beendet sich die Anwendung gerade — genau wie
   * gewünscht. Ein rotes Feld wäre dort die falsche Nachricht.
   */
  const failed = [
    check.error,
    download.error,
    install.error instanceof ApiRequestError ? install.error : null,
    openInBrowser.error,
  ].find((candidate) => candidate !== null);

  if (current.state === 'nicht-unterstuetzt') {
    return (
      <div className="space-y-6">
        {header}
        <Card title="Im Browser">
          <p className="text-sm text-ink-muted">
            Diese Ansicht läuft im Browser und nicht als installierte Anwendung. Eine Updateprüfung
            gibt es hier nicht — neu geladen wird die Seite.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <Card title={`Privatura ${current.currentVersion}`} description={describeState(current)}>
        <div className="space-y-4">
          {current.available !== null && (
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-ink-subtle">Neue Fassung</dt>
              <dd className="text-ink">
                {current.available.version} vom{' '}
                {new Date(current.available.releasedAt).toLocaleDateString('de-DE')}
              </dd>

              {current.available.notes !== null && (
                <>
                  <dt className="text-ink-subtle">Änderungen</dt>
                  <dd className="text-ink">{current.available.notes}</dd>
                </>
              )}

              {current.available.download !== null && (
                <>
                  <dt className="text-ink-subtle">Paket</dt>
                  <dd className="text-ink">{formatBytes(current.available.download.sizeBytes)}</dd>

                  {/* Die Prüfsumme steht hier, damit sie sich vergleichen
                      lässt — dieselbe Zeile, die auch in SHA256SUMS des
                      Releases steht. Die Anwendung prüft sie selbst, bevor
                      sie ein Paket als bereit meldet; wer nachsehen will,
                      kann es trotzdem. */}
                  <dt className="text-ink-subtle">SHA-256</dt>
                  <dd className="break-all font-mono text-xs text-ink-muted">
                    {current.available.download.sha256}
                  </dd>
                </>
              )}

              {current.ready !== null && (
                <>
                  <dt className="text-ink-subtle">Geladen nach</dt>
                  <dd className="break-all font-mono text-xs text-ink-muted">
                    {current.ready.filePath}
                  </dd>
                </>
              )}
            </dl>
          )}

          {/* Der Fortschritt: Zahl und Balken. Während des Downloads fragt
              die Oberfläche jede Sekunde nach. */}
          {current.state === 'laedt' && current.progress !== null && (
            <div className="space-y-1">
              <div
                role="progressbar"
                aria-label="Download des Updatepakets"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={current.progress.percent}
                className="h-2 overflow-hidden rounded-full bg-surface-sunken"
              >
                <div
                  className="h-full bg-inverse transition-[width] duration-500"
                  style={{ width: `${current.progress.percent}%` }}
                />
              </div>
              <p className="tabular-nums text-sm text-ink-muted">
                {formatBytes(current.progress.transferredBytes)} von{' '}
                {formatBytes(current.progress.totalBytes)} ({current.progress.percent} %)
              </p>
            </div>
          )}

          {/* Nicht nur im Zustand „fehler": Ein gescheitertes Backup lässt
              das geladene Paket bereit liegen — der Zustand heißt dann
              weiter „bereit", und die Meldung muss trotzdem zu sehen sein. */}
          {current.error !== null && <StatusText tone="error">{current.error}</StatusText>}

          <div className="flex flex-wrap items-center gap-3">
            {/* Die eine hervorgehobene Handlung ist immer die nächste im
                Ablauf: prüfen, laden, installieren. */}
            {current.state === 'bereit' ? (
              <Button onClick={() => setAsking(true)} pending={install.isPending}>
                Neu starten und installieren
              </Button>
            ) : current.state === 'laedt' ? (
              <Button variant="secondary" onClick={() => cancel.mutate()}>
                Download abbrechen
              </Button>
            ) : current.available?.download !== null && current.available !== null ? (
              <Button
                onClick={() => download.mutate()}
                pending={download.isPending}
                pendingLabel="startet …"
              >
                Update laden
              </Button>
            ) : null}

            <Button
              variant={current.available === null ? 'primary' : 'secondary'}
              onClick={() => check.mutate()}
              pending={check.isPending || current.state === 'prueft'}
              pendingLabel="wird geprüft …"
              disabled={current.state === 'abgeschaltet' || current.state === 'installiert'}
            >
              Jetzt nach Updates suchen
            </Button>

            {restarting ? (
              <StatusText tone="muted">
                Backup und Installation laufen. Die Anwendung beendet sich und startet gleich neu …
              </StatusText>
            ) : (
              current.lastCheckedAt !== null && (
                <StatusText tone="muted">
                  Zuletzt geprüft: {new Date(current.lastCheckedAt).toLocaleString('de-DE')}
                </StatusText>
              )
            )}
          </div>

          {/* Die Wege von Hand — klein, aber vorhanden. Wer der Anwendung
              den Austausch nicht anvertrauen will, soll nicht ausgeliefert
              sein. */}
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
            {current.ready !== null && (
              <Button variant="ghost" size="sm" onClick={() => reveal.mutate()}>
                Paket im Ordner zeigen
              </Button>
            )}
            {current.available?.download !== null && current.available !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openInBrowser.mutate()}
                pending={openInBrowser.isPending}
                pendingLabel="öffnet …"
              >
                Stattdessen im Browser laden
              </Button>
            )}
          </div>

          {failed !== undefined && failed !== null && (
            <ErrorNotice error={failed} title="Der letzte Schritt ist fehlgeschlagen." />
          )}
        </div>
      </Card>

      {(current.state === 'verfuegbar' ||
        current.state === 'laedt' ||
        current.state === 'bereit') && (
        <Card title="So läuft das Update ab">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-muted">
            <li>
              <span className="text-ink">Laden.</span> Das Paket kommt von der eigenen Website. Die
              Anwendung prüft dabei Größe und SHA-256 gegen den Updatefeed; stimmt etwas nicht, wird
              es verworfen.
            </li>
            <li>
              <span className="text-ink">Sichern.</span> Unmittelbar vor der Installation entsteht
              automatisch ein Backup — dasselbe Archiv, das auch der Knopf unter „Backup" erzeugt.
            </li>
            <li>
              <span className="text-ink">Prüfen.</span> Vor dem Austausch prüft das Betriebssystem
              die Signatur des Pakets. Erst danach wird etwas ersetzt.
            </li>
            <li>
              <span className="text-ink">Installieren und neu starten.</span> Die Anwendung ersetzt
              sich selbst und startet wieder — unter Windows über den Installer. Beim ersten Start
              der neuen Fassung laufen fällige Datenbankmigrationen, und davor entsteht ein weiteres
              Backup.
            </li>
          </ol>
          <p className="mt-3 text-sm text-ink-subtle">
            Deine Daten liegen außerhalb der Anwendung und werden dabei nicht angefasst.
            Ungespeicherte Änderungen in einem Rechnungsentwurf gehen beim Neustart allerdings
            verloren.
          </p>
        </Card>
      )}

      <Card title="Selbsttätige Prüfung" description="Was die Anwendung dafür nach draußen fragt">
        <div className="space-y-4">
          <Checkbox
            id="update-automatic"
            label="Täglich nach Updates suchen"
            hint="Höchstens einmal in 24 Stunden, kurz nach dem Start. Ohne Haken fragt die Anwendung nur, wenn du oben auf „Jetzt nach Updates suchen“ klickst. Geladen und installiert wird ohnehin nie ohne Klick."
            checked={current.automatic}
            disabled={settings.isPending || current.state === 'abgeschaltet'}
            onChange={(event) => settings.mutate(event.target.checked)}
          />

          <p className="text-sm text-ink-subtle">
            Die Prüfung holt eine kleine Textdatei mit der aktuellen Versionsnummer. Übertragen
            werden dabei nur die installierte Version und das Betriebssystem — keine Kunden-,
            Rechnungs- oder Nutzungsdaten. Es ist die einzige Verbindung, die diese Anwendung von
            sich aus aufbaut; der E-Mail-Versand kommt nur hinzu, wenn du ihn einrichtest und
            auslöst.
          </p>

          {current.feedUrl !== null && (
            <p className="break-all text-sm text-ink-subtle">
              Gefragt wird: <span className="font-mono text-xs">{current.feedUrl}</span>
            </p>
          )}

          {current.state === 'abgeschaltet' && (
            <StatusText tone="muted">
              Diese Installation hat die Updateprüfung über die Umgebung abgeschaltet.
            </StatusText>
          )}

          {settings.isError && (
            <ErrorNotice
              error={settings.error}
              title="Die Einstellung konnte nicht gespeichert werden."
            />
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={asking}
        title={`Privatura ${current.ready?.version ?? ''} installieren?`}
        description={
          'Die Anwendung erstellt ein Backup, installiert die neue Fassung und startet neu. ' +
          'Ungespeicherte Änderungen in einem Rechnungsentwurf gehen dabei verloren — schließe ' +
          'sie vorher ab.'
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
              if (error instanceof ApiRequestError) setRestarting(false);
            },
          });
        }}
        onClose={() => setAsking(false)}
      />
    </div>
  );
}

/** Ein Satz statt eines Zustandsnamens. */
function describeState(status: UpdateStatus): string {
  switch (status.state) {
    case 'verfuegbar':
      return 'Es gibt eine neuere Fassung.';
    case 'laedt':
      return 'Das Paket wird geladen.';
    case 'bereit':
      return 'Das Paket ist geladen, geprüft und bereit zur Installation.';
    case 'installiert':
      return 'Backup und Installation laufen; die Anwendung startet gleich neu.';
    case 'aktuell':
      return 'Diese Fassung ist die aktuelle.';
    case 'prueft':
      return 'Die Prüfung läuft …';
    case 'fehler':
      return 'Der letzte Versuch ist fehlgeschlagen.';
    case 'abgeschaltet':
      return 'Die Updateprüfung ist abgeschaltet.';
    default:
      return 'Noch nicht geprüft.';
  }
}
