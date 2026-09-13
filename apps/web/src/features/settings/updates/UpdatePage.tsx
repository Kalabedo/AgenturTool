import { formatBytes, type UpdateStatus } from '@agentur-tool/shared';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Checkbox } from '../../../components/ui/Checkbox.js';
import { ErrorNotice } from '../../../components/ui/ErrorNotice.js';
import { LoadingNote } from '../../../components/ui/LoadingNote.js';
import { PageHeader } from '../../../components/ui/PageHeader.js';
import { StatusText } from '../../../components/ui/StatusText.js';
import { useDocumentTitle } from '../../../lib/useDocumentTitle.js';
import {
  useCheckForUpdate,
  useDownloadUpdate,
  useUpdateSettings,
  useUpdateStatus,
} from '../../updates/useUpdateStatus.js';

/**
 * Version und Updates.
 *
 * Die Seite beantwortet drei Fragen, die sonst niemand beantwortet: Welche
 * Fassung läuft hier? Gibt es eine neuere? Und was genau fragt diese
 * Anwendung dafür wen? Die letzte steht ausdrücklich dabei — eine
 * Anwendung, die für sich in Anspruch nimmt, den Rechner nicht zu
 * verlassen, schuldet die Ausnahme im Klartext (D43).
 *
 * Geladen und installiert wird von Hand: „Update laden" öffnet den Browser,
 * der Rest ist dieselbe Installation wie beim ersten Mal. Die Daten liegen
 * außerhalb der Anwendung und bleiben, wo sie sind.
 */
export function UpdatePage(): JSX.Element {
  useDocumentTitle('Updates');

  const status = useUpdateStatus();
  const check = useCheckForUpdate();
  const settings = useUpdateSettings();
  const download = useDownloadUpdate();

  if (status.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Updates" description="Installierte Fassung und neue Versionen." />
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
        <PageHeader title="Updates" description="Installierte Fassung und neue Versionen." />
        <LoadingNote />
      </div>
    );
  }

  const current = status.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Updates" description="Installierte Fassung und neue Versionen." />

      {current.state === 'nicht-unterstuetzt' ? (
        <Card title="Im Browser">
          <p className="text-sm text-ink-muted">
            Diese Ansicht läuft im Browser und nicht als installierte Anwendung. Eine Updateprüfung
            gibt es hier nicht — neu geladen wird die Seite.
          </p>
        </Card>
      ) : (
        <>
          <Card
            title={`AgenturTool ${current.currentVersion}`}
            description={describeState(current)}
          >
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
                      <dd className="text-ink">
                        {formatBytes(current.available.download.sizeBytes)}
                      </dd>

                      {/* Die Prüfsumme steht hier, damit sie sich nach dem
                          Download vergleichen lässt — dieselbe Zeile, die
                          auch in der Datei SHA256SUMS des Releases steht. */}
                      <dt className="text-ink-subtle">SHA-256</dt>
                      <dd className="break-all font-mono text-xs text-ink-muted">
                        {current.available.download.sha256}
                      </dd>
                    </>
                  )}
                </dl>
              )}

              {current.state === 'fehler' && current.error !== null && (
                <StatusText tone="error">{current.error}</StatusText>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant={current.state === 'verfuegbar' ? 'secondary' : 'primary'}
                  onClick={() => check.mutate()}
                  pending={check.isPending || current.state === 'prueft'}
                  pendingLabel="wird geprüft …"
                  disabled={current.state === 'abgeschaltet'}
                >
                  Jetzt nach Updates suchen
                </Button>

                {current.available !== null && (
                  <Button
                    onClick={() => download.mutate()}
                    pending={download.isPending}
                    pendingLabel="öffnet …"
                  >
                    Update laden
                  </Button>
                )}

                {current.lastCheckedAt !== null && (
                  <StatusText tone="muted">
                    Zuletzt geprüft: {new Date(current.lastCheckedAt).toLocaleString('de-DE')}
                  </StatusText>
                )}
              </div>

              {check.isError && (
                <ErrorNotice error={check.error} title="Die Prüfung ist fehlgeschlagen." />
              )}
              {download.isError && (
                <ErrorNotice
                  error={download.error}
                  title="Der Download konnte nicht geöffnet werden."
                />
              )}
            </div>
          </Card>

          {current.available !== null && (
            <Card title="So wird aktualisiert">
              <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-muted">
                <li>
                  „Update laden" öffnet den Browser und lädt das Paket von der eigenen Website.
                </li>
                <li>Vor der Installation ein Backup erstellen — ein Klick unter „Backup".</li>
                <li>
                  AgenturTool schließen und das geladene Paket installieren: unter macOS die
                  Anwendung aus dem DMG ersetzen, unter Windows den Installer ausführen.
                </li>
                <li>
                  Beim ersten Start der neuen Fassung laufen fällige Datenbankmigrationen
                  automatisch; vorher entsteht ein weiteres Backup.
                </li>
              </ol>
            </Card>
          )}

          <Card
            title="Selbsttätige Prüfung"
            description="Was die Anwendung dafür nach draußen fragt"
          >
            <div className="space-y-4">
              <Checkbox
                id="update-automatic"
                label="Täglich nach Updates suchen"
                hint="Höchstens einmal in 24 Stunden, kurz nach dem Start. Ohne Haken fragt die Anwendung nur, wenn du oben auf „Jetzt nach Updates suchen“ klickst."
                checked={current.automatic}
                disabled={settings.isPending || current.state === 'abgeschaltet'}
                onChange={(event) => settings.mutate(event.target.checked)}
              />

              <p className="text-sm text-ink-subtle">
                Die Prüfung holt eine kleine Textdatei mit der aktuellen Versionsnummer. Übertragen
                werden dabei nur die installierte Version und das Betriebssystem — keine Kunden-,
                Rechnungs- oder Nutzungsdaten. Es ist die einzige Verbindung, die diese Anwendung
                von sich aus aufbaut; der E-Mail-Versand kommt nur hinzu, wenn du ihn einrichtest
                und auslöst.
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
        </>
      )}
    </div>
  );
}

/** Ein Satz statt eines Zustandsnamens. */
function describeState(status: UpdateStatus): string {
  switch (status.state) {
    case 'verfuegbar':
      return 'Es gibt eine neuere Fassung.';
    case 'aktuell':
      return 'Diese Fassung ist die aktuelle.';
    case 'prueft':
      return 'Die Prüfung läuft …';
    case 'fehler':
      return 'Die letzte Prüfung ist fehlgeschlagen.';
    case 'abgeschaltet':
      return 'Die Updateprüfung ist abgeschaltet.';
    default:
      return 'Noch nicht geprüft.';
  }
}
