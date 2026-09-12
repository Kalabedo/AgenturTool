import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  taxAdvisorExportInputSchema,
  type TaxAdvisorExportPayload,
  type TaxAdvisorExportSummary,
} from '@agentur-tool/shared';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { FormActions } from '../../../components/ui/FormActions.js';
import { PageHeader } from '../../../components/ui/PageHeader.js';
import { useToast } from '../../../components/ui/Toast.js';
import { Checkbox } from '../../../components/ui/Checkbox.js';
import { ErrorNotice } from '../../../components/ui/ErrorNotice.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { apiClient } from '../../../lib/apiClient.js';
import { useDocumentTitle } from '../../../lib/useDocumentTitle.js';
import { saveFile } from '../../invoices/saveFile.js';

function currentMonth(): { from: string; to: string } {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(
    2,
    '0',
  );
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${lastDay}` };
}

/** Ein vollständiges, aber bewusst nicht als DATEV-Datei ausgegebenes Kanzleipaket. */
export function TaxAdvisorExportPage(): JSX.Element {
  useDocumentTitle('Steuerberater-Export');
  const toast = useToast();
  const defaults = currentMonth();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [dateError, setDateError] = useState<string | null>(null);

  const preview = useMutation({
    mutationFn: (payload: TaxAdvisorExportPayload) =>
      apiClient.post<TaxAdvisorExportSummary>('/tax-advisor/preview', payload),
  });

  const download = useMutation({
    mutationFn: (payload: TaxAdvisorExportPayload) =>
      apiClient.downloadFromPost('/tax-advisor/export', payload, 'steuerberater-export.zip'),
    onSuccess: (file) => {
      saveFile(file);
      toast.success('Das Übergabepaket wurde heruntergeladen.');
    },
  });

  function inputsChanged(): void {
    setDateError(null);
    preview.reset();
    download.reset();
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const parsed = taxAdvisorExportInputSchema.safeParse({ from, to, includeDocuments });
    if (!parsed.success) {
      setDateError(parsed.error.issues[0]?.message ?? 'Bitte den Zeitraum prüfen.');
      return;
    }
    setDateError(null);
    preview.mutate(parsed.data);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Steuerberater-Export"
        description="Ausgestellte Rechnungen und Stornos für einen Zeitraum gesammelt weitergeben."
      />

      <Card
        title="Übergabepaket erstellen"
        description="CSV-Auswertungen, Steueraufteilung und die unveränderten Belege in einer ZIP-Datei"
      >
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rechnungsdatum von" htmlFor="tax-advisor-from" required>
              <Input
                id="tax-advisor-from"
                type="date"
                value={from}
                invalid={dateError !== null}
                onChange={(event) => {
                  setFrom(event.target.value);
                  inputsChanged();
                }}
              />
            </Field>
            <Field
              label="Rechnungsdatum bis"
              htmlFor="tax-advisor-to"
              required
              error={dateError ?? undefined}
            >
              <Input
                id="tax-advisor-to"
                type="date"
                value={to}
                invalid={dateError !== null}
                onChange={(event) => {
                  setTo(event.target.value);
                  inputsChanged();
                }}
              />
            </Field>
          </div>

          <Checkbox
            id="tax-advisor-documents"
            label="PDF- und vorhandene XML-Belege einschließen"
            hint="Empfohlen für die Übergabe: Die Kanzlei kann jede Tabellenzeile am Originalbeleg prüfen."
            checked={includeDocuments}
            onChange={(event) => {
              setIncludeDocuments(event.target.checked);
              inputsChanged();
            }}
          />

          <FormActions>
            <Button
              type="submit"
              disabled={download.isPending}
              pending={preview.isPending}
              pendingLabel="Belege werden geprüft …"
            >
              Inhalt prüfen
            </Button>
          </FormActions>

          {preview.error !== null && (
            <ErrorNotice error={preview.error} title="Der Zeitraum konnte nicht geprüft werden." />
          )}

          {preview.data !== undefined && (
            <div
              className="space-y-3 rounded-md border border-border bg-surface-sunken p-4"
              aria-live="polite"
            >
              <p className="text-sm font-medium text-ink">
                {preview.data.counts.invoices} Belege, davon {preview.data.counts.cancellations}{' '}
                Stornos
                {includeDocuments && (
                  <>
                    {' '}
                    · {preview.data.counts.pdfs} PDFs · {preview.data.counts.xmls} XML-Dateien
                  </>
                )}
              </p>

              {preview.data.problems.length > 0 ? (
                <div role="alert" className="text-sm text-danger-ink">
                  <p className="font-medium">Das Paket ist noch nicht vollständig:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {preview.data.problems.map((problem, index) => (
                      <li key={`${String(problem.invoiceId)}-${String(index)}`}>
                        <Link
                          to={`/invoices/${String(problem.invoiceId)}`}
                          className="font-medium underline"
                        >
                          {problem.invoiceNumber}
                        </Link>
                        : {problem.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-success-ink">
                    Alle Daten und Belege sind lesbar.
                  </span>
                  <Button
                    type="button"
                    pending={download.isPending}
                    pendingLabel="Paket wird erstellt …"
                    onClick={() => {
                      if (preview.variables !== undefined) download.mutate(preview.variables);
                    }}
                  >
                    ZIP herunterladen
                  </Button>
                </div>
              )}
            </div>
          )}

          {download.error !== null && (
            <ErrorNotice error={download.error} title="Der Export ist fehlgeschlagen." />
          )}
        </form>
      </Card>

      <Card title="Was enthalten ist">
        <div className="space-y-3 text-sm text-ink-muted">
          <p>
            <code className="rounded bg-surface-raised px-1">rechnungen.csv</code> enthält die
            eingefrorenen Netto-, Steuer- und Bruttosummen. Dazu kommen eine Steueraufteilung je
            Steuersatz, alle Rechnungspositionen und ein Manifest mit SHA-256-Prüfsummen.
          </p>
          <p>
            Entwürfe werden nie exportiert. Der Zeitraum ist einschließlich und bezieht sich auf das
            Rechnungsdatum; Stornos erscheinen als eigene Belege mit negativen Beträgen.
          </p>
          <p>
            Das Paket ist kein DATEV-Buchungsstapel. Dafür müssten Konten, Steuerschlüssel sowie
            Berater- und Mandantennummer zuerst mit der Kanzlei festgelegt werden.
          </p>
        </div>
      </Card>
    </div>
  );
}
