import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatBytes, type BackupStatusResponse, type BackupSummary } from '@agentur-tool/shared';
import { apiClient } from '../../../lib/apiClient.js';
import { queryKeys } from '../../../lib/queryKeys.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { EmptyState } from '../../../components/ui/EmptyState.js';
import { ErrorNotice } from '../../../components/ui/ErrorNotice.js';
import { LoadingNote } from '../../../components/ui/LoadingNote.js';
import { saveFile } from '../../invoices/saveFile.js';

/**
 * Datensicherung.
 *
 * Erzeugen und Herunterladen sind zwei Schritte, weil das Archiv unter
 * `data/backups` liegen bleibt: Ein abgebrochener Download kostet dann
 * nichts, und der nächtliche Cron auf dem Server benutzt denselben Weg.
 *
 * Zurückspielen steht hier bewusst nur als Anleitung: Die Wiederherstellung
 * ersetzt das Datenverzeichnis unter der laufenden Anwendung. Ein Knopf
 * dafür wäre der gefährlichste der ganzen Oberfläche — und der einzige,
 * dessen Wirkung sich nicht zurücknehmen lässt.
 */
export function BackupPage(): JSX.Element {
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: queryKeys.backup,
    queryFn: () => apiClient.get<BackupStatusResponse>('/backup/status'),
  });

  const create = useMutation({
    mutationFn: () => apiClient.post<BackupSummary>('/backup/export', {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.backup });
    },
  });

  const download = useMutation({
    mutationFn: (filename: string) => apiClient.download(`/backup/${filename}`, filename),
    onSuccess: saveFile,
  });

  const error = [create.error, download.error].find((candidate) => candidate !== null);

  return (
    <div className="space-y-6">
      <Card
        title="Backup erstellen"
        description="Datenbank, Logos und alle erzeugten PDFs in einer ZIP-Datei"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Das Archiv enthält ein Manifest mit einer Prüfsumme je Datei. Beim Zurückspielen wird
            jede davon geprüft, bevor etwas ersetzt wird.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? 'wird erstellt …' : 'Backup jetzt erstellen'}
            </Button>
            {create.isSuccess && !create.isPending && (
              <span className="text-sm text-emerald-700">
                {create.data.counts.invoices} Rechnungen und {create.data.counts.documents} PDFs
                gesichert.
              </span>
            )}
          </div>
          {error !== undefined && error !== null && (
            <ErrorNotice error={error} title="Das Backup ist fehlgeschlagen." />
          )}
        </div>
      </Card>

      <Card title="Vorhandene Archive" description={status.data?.directory}>
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
            description="Ein Backup, das es nicht gibt, hilft im Ernstfall nicht. Das erste ist ein Klick."
          />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {status.data.backups.map((entry) => (
              <li
                key={entry.filename}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2"
              >
                <span className="truncate font-medium text-slate-900">{entry.filename}</span>
                <span className="whitespace-nowrap text-slate-500">
                  {new Date(entry.createdAt).toLocaleString('de-DE')}
                </span>
                <span className="whitespace-nowrap tabular-nums text-slate-500">
                  {formatBytes(entry.sizeBytes)}
                </span>
                <Button
                  variant="secondary"
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
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            Die Wiederherstellung ersetzt Datenbank und Datenverzeichnis. Die Anwendung sollte dabei
            gestoppt sein:
          </p>
          <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
            pnpm restore &lt;archiv.zip&gt; --force
          </pre>
          <p>
            Ohne <code className="rounded bg-slate-100 px-1">--force</code> bricht der Vorgang ab,
            solange Daten vorhanden sind. Mit der Option werden sie nicht gelöscht, sondern nach{' '}
            <code className="rounded bg-slate-100 px-1">data.bak-&lt;Zeitstempel&gt;</code>{' '}
            verschoben. Anschließend laufen die Migrationen automatisch.
          </p>
        </div>
      </Card>
    </div>
  );
}
