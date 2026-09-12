import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  MAIL_ATTACHMENT_LABELS,
  MAIL_HANDOFF_METHOD,
  MAIL_STATUS,
  MAIL_TRANSPORT,
  formatAddressList,
  parseAddressList,
  type InvoiceResponse,
  type MailAttachmentKind,
  type MailDraftResponse,
  type MailSendResponse,
} from '@agentur-tool/shared';
import { apiClient } from '../../lib/apiClient.js';
import { formErrorOf } from '../../lib/errorMessage.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Button } from '../../components/ui/Button.js';
import { Checkbox } from '../../components/ui/Checkbox.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { ErrorNotice } from '../../components/ui/ErrorNotice.js';
import { Field } from '../../components/ui/Field.js';
import { Input } from '../../components/ui/Input.js';
import { LoadingNote } from '../../components/ui/LoadingNote.js';
import { Textarea } from '../../components/ui/Textarea.js';

/**
 * Der Versanddialog.
 *
 * Eine Maske für beides, was diese Anwendung verschickt — eine Rechnung
 * oder einen Zeitnachweis. Der Unterschied steckt vollständig in der
 * Quelle: Sie bestimmt, welche Vorlage der Server nimmt, wen er als
 * Empfänger vorschlägt und welche Anhänge er anbietet. Hier steht deshalb
 * nichts über Rechnungen.
 *
 * Der Entwurf kommt fertig vom Server und ist danach frei bearbeitbar. Was
 * hier abgeschickt wird, ist genau das, was im Fenster steht — die Vorlage
 * hat ihre Arbeit getan, bevor der Dialog aufging.
 */

/** Die beiden Quellen, aus denen eine Nachricht entstehen kann. */
export type MailDialogSource =
  | { kind: 'INVOICE'; invoiceId: number }
  | { kind: 'TIME_REPORT'; customerId: number; from: string; to: string };

function draftPath(source: MailDialogSource): string {
  if (source.kind === 'INVOICE') return `/mail/draft/invoice/${String(source.invoiceId)}`;

  const params = new URLSearchParams({
    customerId: String(source.customerId),
    from: source.from,
    to: source.to,
  });
  return `/mail/draft/time-report?${params.toString()}`;
}

/** Die Felder, die der Benutzer bearbeitet. */
interface Composed {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachments: MailAttachmentKind[];
}

function fromDraft(draft: MailDraftResponse): Composed {
  return {
    to: formatAddressList(draft.to),
    cc: formatAddressList(draft.cc),
    bcc: formatAddressList(draft.bcc),
    subject: draft.subject,
    body: draft.body,
    attachments: draft.attachments
      .filter((option) => option.available && option.selected)
      .map((option) => option.kind),
  };
}

/** Der Hinweisblock über dem Formular: was fehlt, was auffällt. */
function Notices({ draft }: { draft: MailDraftResponse }): JSX.Element | null {
  if (draft.transportReady && draft.warnings.length === 0) return null;

  return (
    <div className="space-y-3">
      {!draft.transportReady && (
        <div className="rounded-md border border-attention-border bg-attention-surface p-3 text-sm text-attention-ink">
          <p className="font-medium">So lässt sich noch nichts verschicken.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {draft.transportProblems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          <p className="mt-2">
            <Link className="underline" to="/settings/mail">
              Zu den E-Mail-Einstellungen
            </Link>
          </p>
        </div>
      )}

      {draft.warnings.map((warning) => (
        <p key={warning} className="text-sm text-attention-ink">
          {warning}
        </p>
      ))}
    </div>
  );
}

/**
 * Was nach dem Absenden dasteht.
 *
 * Zwei verschiedene Sätze für zwei verschiedene Zusagen: Über SMTP ist die
 * Nachricht draußen und der Versandvermerk gesetzt. Über die Mail-Anwendung
 * ist ein Entwurf geöffnet — mehr weiß die Anwendung nicht, und deshalb
 * steht dort der Knopf, mit dem der Benutzer den Vermerk selbst setzt.
 */
function Result({
  result,
  invoiceId,
  onMarkSent,
  markPending,
  markedManually,
}: {
  result: MailSendResponse;
  invoiceId: number | null;
  onMarkSent: () => void;
  markPending: boolean;
  markedManually: boolean;
}): JSX.Element {
  if (result.message.status === MAIL_STATUS.SENT) {
    return (
      <div className="rounded-md border border-success-ink/30 bg-success-surface p-4 text-sm text-success-ink">
        <p className="font-medium">Versendet an {formatAddressList(result.message.to)}.</p>
        {result.markedSentAt !== null && (
          <p className="mt-1">Die Rechnung ist damit als versendet vermerkt.</p>
        )}
      </div>
    );
  }

  const attachmentCount = result.message.attachments.length;
  const withAttachments =
    attachmentCount === 0
      ? ''
      : attachmentCount === 1
        ? ' — samt Anhang'
        : ` — samt ${String(attachmentCount)} Anhängen`;
  const application = result.handoff?.application ?? 'deiner Mail-Anwendung';

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-surface-sunken p-4 text-sm text-ink-muted">
        {result.handoff?.method === MAIL_HANDOFF_METHOD.DRAFT ? (
          <p className="font-medium text-ink">
            Der Entwurf steht in {application}
            {withAttachments}. Dort nur noch abschicken.
          </p>
        ) : (
          <>
            <p className="font-medium text-ink">
              Die fertige Nachricht ist in {application} geöffnet{withAttachments}.
            </p>
            <p className="mt-2">
              Zeigt dein Mailprogramm sie als eingegangene Nachricht statt als Entwurf, genügt
              „Weiterleiten" — die Anhänge bleiben dabei erhalten.
            </p>
          </>
        )}

        <p className="mt-2">
          Ob die Nachricht abgeschickt wurde, weiß nur deine Mail-Anwendung. Deshalb steht die
          Rechnung noch nicht als versendet.
        </p>

        {result.handoff?.path != null && (
          <details className="mt-2">
            <summary className="cursor-pointer text-ink-subtle">
              Nichts aufgegangen? Hier liegt die Nachricht
            </summary>
            <p className="mt-1 break-all font-mono text-xs text-ink-subtle">
              {result.handoff.path}
            </p>
          </details>
        )}
      </div>

      {invoiceId !== null &&
        (markedManually ? (
          <p className="text-sm text-success-ink">Als versendet vermerkt.</p>
        ) : (
          <Button variant="secondary" disabled={markPending} onClick={onMarkSent}>
            {markPending ? 'wird vermerkt …' : 'Jetzt als versendet markieren'}
          </Button>
        ))}
    </div>
  );
}

export function SendMailDialog({
  source,
  title,
  description,
  open,
  onClose,
}: {
  source: MailDialogSource;
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const path = draftPath(source);
  const invoiceId = source.kind === 'INVOICE' ? source.invoiceId : null;

  const [composed, setComposed] = useState<Composed | null>(null);
  const [showCopies, setShowCopies] = useState(false);
  const [result, setResult] = useState<MailSendResponse | null>(null);
  const [markedManually, setMarkedManually] = useState(false);

  const draft = useQuery({
    queryKey: queryKeys.mail.draft(path),
    queryFn: () => apiClient.get<MailDraftResponse>(path),
    enabled: open,
    // Der Entwurf hängt am Stand der Stammdaten und der Einstellungen; beim
    // Öffnen soll er der aktuelle sein und nicht der von vorhin.
    staleTime: 0,
  });

  // Die Felder werden einmal aus dem Entwurf befüllt und gehören danach dem
  // Benutzer. Ein erneutes Laden — etwa nach dem Wiedereintritt ins Fenster —
  // darf eine begonnene Nachricht nicht überschreiben.
  useEffect(() => {
    if (draft.data === undefined) return;
    setComposed((current) => current ?? fromDraft(draft.data));
    setShowCopies((current) => current || draft.data.cc.length > 0 || draft.data.bcc.length > 0);
  }, [draft.data]);

  const send = useMutation({
    mutationFn: (values: Composed) =>
      apiClient.post<MailSendResponse>('/mail/send', {
        source,
        to: values.to,
        cc: values.cc,
        bcc: values.bcc,
        subject: values.subject,
        body: values.body,
        attachments: values.attachments,
      }),
    onSuccess: async (response) => {
      setResult(response);
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.mail.all });
    },
  });

  const markSent = useMutation({
    mutationFn: () => apiClient.post<InvoiceResponse>(`/invoices/${String(invoiceId)}/sent`, {}),
    onSuccess: async (invoice) => {
      setMarkedManually(true);
      queryClient.setQueryData(queryKeys.invoices.byId(invoice.id), invoice);
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    },
  });

  const sendError = formErrorOf(send.error) ?? formErrorOf(markSent.error);
  const busy = send.isPending || markSent.isPending;
  const ready = draft.isSuccess && composed !== null && draft.data.transportReady;
  const recipients = composed === null ? [] : parseAddressList(composed.to);

  const update = (patch: Partial<Composed>): void => {
    setComposed((current) => (current === null ? current : { ...current, ...patch }));
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
      description={description}
      footer={
        result !== null ? (
          <Button onClick={onClose}>Schließen</Button>
        ) : (
          <>
            {sendError !== null && (
              <span role="alert" className="mr-auto text-sm text-danger-strong">
                {sendError}
              </span>
            )}
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Abbrechen
            </Button>
            <Button
              disabled={!ready || busy || recipients.length === 0}
              pending={send.isPending}
              pendingLabel="wird gesendet …"
              onClick={() => {
                if (composed !== null) send.mutate(composed);
              }}
            >
              {draft.data?.transport === MAIL_TRANSPORT.MAIL_APP
                ? 'In Mail-Anwendung öffnen'
                : 'Senden'}
            </Button>
          </>
        )
      }
    >
      {draft.isLoading && <LoadingNote>Entwurf wird vorbereitet …</LoadingNote>}

      {draft.isError && (
        <ErrorNotice
          error={draft.error}
          title="Der Entwurf konnte nicht vorbereitet werden."
          onRetry={() => void draft.refetch()}
        />
      )}

      {result !== null && (
        <Result
          result={result}
          invoiceId={invoiceId}
          markedManually={markedManually}
          markPending={markSent.isPending}
          onMarkSent={() => markSent.mutate()}
        />
      )}

      {result === null && draft.isSuccess && composed !== null && (
        <div className="space-y-5">
          <Notices draft={draft.data} />

          <Field
            label="An"
            htmlFor="mail-to"
            required
            hint="Mehrere Adressen mit Komma trennen"
            error={
              composed.to.trim() !== '' && recipients.length === 0
                ? 'Bitte mindestens einen Empfänger angeben'
                : undefined
            }
          >
            <Input
              id="mail-to"
              type="text"
              value={composed.to}
              onChange={(event) => update({ to: event.target.value })}
            />
          </Field>

          {showCopies ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kopie (Cc)" htmlFor="mail-cc">
                <Input
                  id="mail-cc"
                  type="text"
                  value={composed.cc}
                  onChange={(event) => update({ cc: event.target.value })}
                />
              </Field>
              <Field label="Blindkopie (Bcc)" htmlFor="mail-bcc">
                <Input
                  id="mail-bcc"
                  type="text"
                  value={composed.bcc}
                  onChange={(event) => update({ bcc: event.target.value })}
                />
              </Field>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2.5"
              onClick={() => setShowCopies(true)}
            >
              + Kopie und Blindkopie
            </Button>
          )}

          <Field label="Betreff" htmlFor="mail-subject" required>
            <Input
              id="mail-subject"
              type="text"
              value={composed.subject}
              onChange={(event) => update({ subject: event.target.value })}
            />
          </Field>

          <Field
            label="Nachricht"
            htmlFor="mail-body"
            required
            hint="Aus der Vorlage vorbelegt — Änderungen hier gelten nur für diese Nachricht."
          >
            <Textarea
              id="mail-body"
              rows={10}
              value={composed.body}
              onChange={(event) => update({ body: event.target.value })}
            />
          </Field>

          <fieldset>
            <legend className="text-sm font-medium text-ink-muted">Anhänge</legend>
            <div className="mt-2 space-y-2">
              {draft.data.attachments.map((option) => (
                <Checkbox
                  key={option.kind}
                  id={`mail-attachment-${option.kind}`}
                  label={`${MAIL_ATTACHMENT_LABELS[option.kind]} (${option.filename})`}
                  hint={option.reason ?? undefined}
                  disabled={!option.available}
                  checked={composed.attachments.includes(option.kind)}
                  onChange={(event) =>
                    update({
                      attachments: event.target.checked
                        ? [...composed.attachments, option.kind]
                        : composed.attachments.filter((kind) => kind !== option.kind),
                    })
                  }
                />
              ))}
            </div>
          </fieldset>

          {draft.data.transport === MAIL_TRANSPORT.MAIL_APP && (
            <p className="text-sm text-ink-subtle">
              Die Nachricht öffnet sich in deiner Mail-Anwendung — Anhänge inbegriffen. Abgeschickt
              wird sie dort von dir.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
