import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BACKUP_REASON_LABELS,
  formatBytes,
  type BackupStatusResponse,
  type BackupSummary,
} from '@privatura/shared';
import { apiClient } from '../../../lib/apiClient.js';
import { queryKeys } from '../../../lib/queryKeys.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { EmptyState } from '../../../components/ui/EmptyState.js';
import { ErrorNotice } from '../../../components/ui/ErrorNotice.js';
import { LoadingNote } from '../../../components/ui/LoadingNote.js';
import { PageHeader } from '../../../components/ui/PageHeader.js';
import { useToast } from '../../../components/ui/Toast.js';
import { saveFile } from '../../invoices/saveFile.js';
import { useDocumentTitle } from '../../../lib/useDocumentTitle.js';

/**
 * Datensicherung.
 *
 * Erzeugen und Herunterladen sind zwei Schritte, weil das Archiv unter
 * `data/backups` liegen bleibt: Ein abgebrochener Download kostet dann
 * nichts, und die Tagessicherung benutzt denselben Weg.
 *
 * Zurückspielen steht hier bewusst nur als Anleitung: Die Wiederherstellung
 * ersetzt das Datenverzeichnis unter der laufenden Anwendung. Ein Knopf
 * dafür wäre der gefährlichste der ganzen Oberfläche — und der einzige,
 * dessen Wirkung sich nicht zurücknehmen lässt.
 */
export function BackupPage(): JSX.Element {
  useDocumentTitle('Backup');
  const queryClient = useQueryClient();
  const toast = useToast();

  const status = useQuery({
    queryKey: queryKeys.backup,
    queryFn: () => apiClient.get<BackupStatusResponse>('/backup/status'),
  });

  const create = useMutation({
    mutationFn: () => apiClient.post<BackupSummary>('/backup/export', {}),
    onSuccess: async (summary) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.backup });
      toast.success(
        `Backup erstellt: ${summary.counts.invoices} Rechnungen und ${summary.counts.documents} PDFs gesichert.` +
          // Was die Aufbewahrung entfernt hat, gehört in dieselbe Meldung:
          // Ein Archiv, das verschwindet, ohne dass es jemand sagt, ist
          // genau die Überraschung, die man bei Sicherungen nicht will.
          (summary.removed.length === 0
            ? ''
            : ` ${String(summary.removed.length)} ältere ${
                summary.removed.length === 1 ? 'Archiv wurde' : 'Archive wurden'
              } dabei ausgedünnt.`),
      );
    },
  });

  const download = useMutation({
    mutationFn: (filename: string) => apiClient.download(`/backup/${filename}`, filename),
    onSuccess: (file) => {
      saveFile(file);
      toast.success('Das Archiv wurde heruntergeladen.');
    },
  });

  const error = [create.error, download.error].find((candidate) => candidate !== null);

  // Anzahl und belegter Platz stehen im Kopf der Karte: Die Summe steht
  // schon in der Liste, und die Frage „wie viel liegt da eigentlich" ist
  // die erste, die jemand an diese Seite hat.
  const archivesDescription =
    status.data === undefined
      ? undefined
      : status.data.backups.length === 0
        ? status.data.directory
        : `${String(status.data.backups.length)} ${
            status.data.backups.length === 1 ? 'Archiv' : 'Archive'
          } · ${formatBytes(
            status.data.backups.reduce((sum, entry) => sum + entry.sizeBytes, 0),
          )} · ${status.data.directory}`;

  return (
    <div className="space-y-6">
      {/* Auch diese Seite bekommt ihren Kopf: Ohne ihn begann sie als
          einzige Einstellungsseite direkt mit einer Karte, und beim Wechsel
          aus einer anderen Registerkarte sprang der ganze Inhalt nach oben. */}
      <PageHeader
        title="Backup"
        description="Datenbestand sichern und die vorhandenen Archive einsehen."
      />

      <Card
        title="Backup erstellen"
        description="Datenbank, Logos und alle erzeugten PDFs in einer ZIP-Datei"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Das Archiv enthält ein Manifest mit einer Prüfsumme je Datei. Beim Zurückspielen wird
            jede davon geprüft, bevor etwas ersetzt wird.
          </p>
          {/* Was von selbst geschieht, soll man nachlesen können — sonst
              wundert man sich über Archive, die man nicht angelegt hat, und
              über andere, die verschwunden sind. */}
          <p className="text-sm text-ink-muted">
            Von selbst entsteht eine Sicherung einmal am Tag beim Start, vor Änderungen an der
            Datenbank und vor jedem Update. Aufbewahrt werden alle Sicherungen der letzten 7 Tage,
            danach eine je Woche für 8 Wochen und eine je Monat für 12 Monate; was älter ist, wird
            entfernt. Die jüngsten drei Archive bleiben immer.
          </p>
          {/* Die Rückmeldung steht unten als Meldung: Das neue Archiv taucht
              in der Liste darunter auf, und die Zählung dazu muss nicht
              dauerhaft neben dem Knopf stehen bleiben. */}
          <Button
            onClick={() => create.mutate()}
            pending={create.isPending}
            pendingLabel="wird erstellt …"
          >
            Backup jetzt erstellen
          </Button>
          {error !== undefined && error !== null && (
            <ErrorNotice error={error} title="Das Backup ist fehlgeschlagen." />
          )}
        </div>
      </Card>

      <Card title="Vorhandene Archive" description={archivesDescription}>
        {status.isError ? (
          <ErrorNotice
            error={status.error}
            title="Die vorhandenen Archive konnten nicht gelesen werden."
            onRetry={() => void status.refetch()}
          />
        ) : status.data === undefined ? (
          <LoadingNote />
        ) : status.data.backups.length === 0 ? (
          <EmptyState
            title="Noch kein Backup"
            description="Ein Backup, das es nicht gibt, hilft im Ernstfall nicht. Das erste ist ein Klick — spätestens beim nächsten Start entsteht es von selbst."
          />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {status.data.backups.map((entry) => (
              <li
                key={entry.filename}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2"
              >
                <span className="truncate font-medium text-ink">{entry.filename}</span>
                {entry.reason !== null && <Badge>{BACKUP_REASON_LABELS[entry.reason]}</Badge>}
                <span className="whitespace-nowrap text-ink-subtle">
                  {new Date(entry.createdAt).toLocaleString('de-DE')}
                </span>
                <span className="whitespace-nowrap tabular-nums text-ink-subtle">
                  {formatBytes(entry.sizeBytes)}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={download.isPending}
                  onClick={() => download.mutate(entry.filename)}
                >
                  Herunterladen
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Zurückspielen"
        description="Läuft über die Kommandozeile, nicht über den Browser"
      >
        <div className="space-y-3 text-sm text-ink-muted">
          <p>
            Die Wiederherstellung ersetzt Datenbank und Datenverzeichnis. Die Anwendung sollte dabei
            gestoppt sein:
          </p>
          <pre className="overflow-x-auto rounded-md bg-inverse p-3 text-xs text-on-inverse">
            pnpm restore &lt;archiv.zip&gt; --force
          </pre>
          <p>
            Ohne <code className="rounded bg-surface-raised px-1">--force</code> bricht der Vorgang
            ab, solange Daten vorhanden sind. Mit der Option werden sie nicht gelöscht, sondern nach{' '}
            <code className="rounded bg-surface-raised px-1">data.bak-&lt;Zeitstempel&gt;</code>{' '}
            verschoben. Anschließend laufen die Migrationen automatisch.
          </p>
        </div>
      </Card>
    </div>
  );
}
