import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_SMTP_PORT,
  MAIL_SECURITY,
  MAIL_SECURITY_LABELS,
  MAIL_SECURITY_VALUES,
  MAIL_TRANSPORT,
  MAIL_TRANSPORT_LABELS,
  MAIL_TRANSPORT_VALUES,
  type MailConnectionCheckResponse,
  type MailSecurity,
  type MailSettingsResponse,
  type MailTransport,
} from '@agentur-tool/shared';
import { apiClient } from '../../../lib/apiClient.js';
import { fieldErrorsOf, formErrorOf } from '../../../lib/errorMessage.js';
import { queryKeys } from '../../../lib/queryKeys.js';
import { useDocumentTitle } from '../../../lib/useDocumentTitle.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Checkbox } from '../../../components/ui/Checkbox.js';
import { ErrorNotice } from '../../../components/ui/ErrorNotice.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LoadingNote } from '../../../components/ui/LoadingNote.js';
import { Select } from '../../../components/ui/Select.js';
import { MailTemplatesCard } from './MailTemplatesCard.js';

/**
 * Einstellungen → E-Mail.
 *
 * Eine Seite mit zwei Karten statt zweier Reiter: Versandweg und Vorlagen
 * gehören zusammen, man richtet sie am selben Nachmittag ein, und die
 * Reiterleiste der Einstellungen soll nicht zum zweiten Menü werden.
 *
 * Der Versandweg steht auf „Kein Versand eingerichtet", bis hier jemand
 * etwas anderes wählt. Das ist die sichtbare Seite der Zusage aus D43: Die
 * Anwendung greift nicht von sich aus nach außen.
 */

/** Die Felder der Maske; alles Zeichenketten, wie das Formular sie führt. */
interface FormValues {
  transport: MailTransport;
  fromName: string;
  fromAddress: string;
  replyTo: string;
  bccSelf: boolean;
  host: string;
  port: string;
  security: MailSecurity;
  username: string;
  password: string;
}

function toFormValues(settings: MailSettingsResponse): FormValues {
  return {
    transport: settings.transport,
    fromName: settings.fromName ?? '',
    fromAddress: settings.fromAddress ?? '',
    replyTo: settings.replyTo ?? '',
    bccSelf: settings.bccSelf,
    host: settings.host ?? '',
    port: settings.port === null ? '' : String(settings.port),
    security: settings.security,
    username: settings.username ?? '',
    // Nie vorbelegt: Der Server gibt es nicht heraus, und ein Feld voller
    // Punkte, hinter denen nichts steht, wäre eine Lüge über den Zustand.
    password: '',
  };
}

export function MailSettingsPage(): JSX.Element {
  useDocumentTitle('E-Mail');
  const queryClient = useQueryClient();

  const [values, setValues] = useState<FormValues | null>(null);
  const [saved, setSaved] = useState(false);
  const [check, setCheck] = useState<MailConnectionCheckResponse | null>(null);

  const settings = useQuery({
    queryKey: queryKeys.mail.settings,
    queryFn: () => apiClient.get<MailSettingsResponse>('/mail/settings'),
  });

  useEffect(() => {
    if (settings.data !== undefined) setValues((current) => current ?? toFormValues(settings.data));
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (form: FormValues) =>
      apiClient.put<MailSettingsResponse>('/mail/settings', {
        transport: form.transport,
        fromName: form.fromName,
        fromAddress: form.fromAddress,
        replyTo: form.replyTo,
        bccSelf: form.bccSelf,
        host: form.host,
        port: form.port,
        security: form.security,
        username: form.username,
        // Ein leeres Feld heißt „nicht angefasst" und wird deshalb gar nicht
        // erst mitgeschickt. Zum Löschen gibt es den eigenen Knopf.
        ...(form.password === '' ? {} : { password: form.password }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.mail.settings, updated);
      setValues(toFormValues(updated));
      setSaved(true);
      setCheck(null);
    },
  });

  const removePassword = useMutation({
    mutationFn: (form: FormValues) =>
      apiClient.put<MailSettingsResponse>('/mail/settings', {
        transport: form.transport,
        fromName: form.fromName,
        fromAddress: form.fromAddress,
        replyTo: form.replyTo,
        bccSelf: form.bccSelf,
        host: form.host,
        port: form.port,
        security: form.security,
        username: form.username,
        password: '',
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.mail.settings, updated);
      setValues(toFormValues(updated));
    },
  });

  const checkConnection = useMutation({
    mutationFn: () => apiClient.post<MailConnectionCheckResponse>('/mail/settings/check', {}),
    onSuccess: setCheck,
  });

  if (settings.isError) {
    return (
      <ErrorNotice
        error={settings.error}
        title="Die E-Mail-Einstellungen konnten nicht geladen werden."
        onRetry={() => void settings.refetch()}
      />
    );
  }

  // `current` ist der gespeicherte Stand, `values` der bearbeitete. Beide
  // stehen erst nach dem ersten Laden — bis dahin gibt es nichts zu zeigen.
  const current = settings.data;
  if (current === undefined || values === null) {
    return <LoadingNote>E-Mail-Einstellungen werden geladen …</LoadingNote>;
  }

  const fieldErrors = fieldErrorsOf(save.error) ?? {};
  const formError = formErrorOf(save.error);
  const isSmtp = values.transport === MAIL_TRANSPORT.SMTP;

  function update(patch: Partial<FormValues>): void {
    setValues((previous) => (previous === null ? previous : { ...previous, ...patch }));
    setSaved(false);
    setCheck(null);
  }

  /** Ob im Portfeld noch ein Vorschlag steht und keine eigene Eingabe. */
  function portIsSuggestion(): boolean {
    return (
      values?.port === '' ||
      MAIL_SECURITY_VALUES.some(
        (candidate) => values?.port === String(DEFAULT_SMTP_PORT[candidate as MailSecurity]),
      )
    );
  }

  /**
   * Der Port folgt der Verschlüsselung — solange niemand ihn selbst gesetzt
   * hat. Wer von STARTTLS auf TLS umstellt, meint fast immer auch 465; wer
   * dort eine eigene Zahl stehen hat, meint sie.
   */
  function changeSecurity(security: MailSecurity): void {
    update({
      security,
      port: portIsSuggestion() ? String(DEFAULT_SMTP_PORT[security]) : values?.port,
    });
  }

  /**
   * Wer auf SMTP umstellt, findet ein leeres Pflichtfeld „Port" vor — und
   * die Antwort darauf steht schon in der Verschlüsselung daneben.
   */
  function changeTransport(transport: MailTransport): void {
    const security = values?.security ?? MAIL_SECURITY.STARTTLS;
    update({
      transport,
      port:
        transport === MAIL_TRANSPORT.SMTP && portIsSuggestion()
          ? String(DEFAULT_SMTP_PORT[security])
          : values?.port,
    });
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (values !== null) save.mutate(values);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">E-Mail</h1>
        <p className="mt-1 text-sm text-slate-600">
          Rechnungen und Zeitnachweise direkt aus AgenturTool verschicken.
        </p>
      </div>

      <Card
        title="Versandweg"
        description="Ohne Einrichtung baut AgenturTool keine Verbindung nach außen auf."
      >
        <form className="space-y-5" onSubmit={submit}>
          <Field
            label="Wie soll verschickt werden?"
            htmlFor="mail-transport"
            hint={
              values.transport === MAIL_TRANSPORT.MAIL_APP
                ? 'AgenturTool legt den Entwurf samt Anhängen in deinem Mailprogramm an; abgeschickt wird er dort von dir. Bei Apple Mail fragt macOS einmalig um Erlaubnis dafür — ohne sie öffnet AgenturTool stattdessen eine fertige Nachrichtendatei.'
                : undefined
            }
          >
            <Select
              id="mail-transport"
              value={values.transport}
              onChange={(event) => changeTransport(event.target.value as MailTransport)}
            >
              {MAIL_TRANSPORT_VALUES.map((transport) => (
                <option key={transport} value={transport}>
                  {MAIL_TRANSPORT_LABELS[transport as MailTransport]}
                </option>
              ))}
            </Select>
          </Field>

          {values.transport !== MAIL_TRANSPORT.NONE && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Absendername" htmlFor="mail-from-name">
                <Input
                  id="mail-from-name"
                  type="text"
                  value={values.fromName}
                  placeholder="Agentur Beispiel"
                  onChange={(event) => update({ fromName: event.target.value })}
                />
              </Field>
              <Field
                label="Absenderadresse"
                htmlFor="mail-from-address"
                required
                error={fieldErrors.fromAddress}
              >
                <Input
                  id="mail-from-address"
                  type="email"
                  value={values.fromAddress}
                  invalid={fieldErrors.fromAddress !== undefined}
                  onChange={(event) => update({ fromAddress: event.target.value })}
                />
              </Field>
              <Field
                label="Antwort an"
                htmlFor="mail-reply-to"
                hint="Leer lassen heißt: Antworten gehen an die Absenderadresse."
                error={fieldErrors.replyTo}
              >
                <Input
                  id="mail-reply-to"
                  type="email"
                  value={values.replyTo}
                  invalid={fieldErrors.replyTo !== undefined}
                  onChange={(event) => update({ replyTo: event.target.value })}
                />
              </Field>
              <div className="flex items-end pb-2">
                <Checkbox
                  id="mail-bcc-self"
                  label="Blindkopie an mich selbst"
                  hint="Der Beleg im eigenen Postfach."
                  checked={values.bccSelf}
                  onChange={(event) => update({ bccSelf: event.target.checked })}
                />
              </div>
            </div>
          )}

          {isSmtp && (
            <div className="space-y-4 border-t border-slate-200 pt-5">
              <div className="grid gap-4 sm:grid-cols-6">
                <Field
                  label="Postausgangsserver"
                  htmlFor="mail-host"
                  required
                  className="sm:col-span-3"
                  error={fieldErrors.host}
                >
                  <Input
                    id="mail-host"
                    type="text"
                    value={values.host}
                    placeholder="mail.example.de"
                    invalid={fieldErrors.host !== undefined}
                    onChange={(event) => update({ host: event.target.value })}
                  />
                </Field>
                <Field
                  label="Verschlüsselung"
                  htmlFor="mail-security"
                  className="sm:col-span-2"
                  hint={
                    values.security === MAIL_SECURITY.NONE
                      ? 'Nur für einen Mailserver auf diesem Rechner. Über das Netz ginge das Passwort im Klartext.'
                      : undefined
                  }
                >
                  <Select
                    id="mail-security"
                    value={values.security}
                    onChange={(event) => changeSecurity(event.target.value as MailSecurity)}
                  >
                    {MAIL_SECURITY_VALUES.map((security) => (
                      <option key={security} value={security}>
                        {MAIL_SECURITY_LABELS[security as MailSecurity]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Port"
                  htmlFor="mail-port"
                  required
                  className="sm:col-span-1"
                  error={fieldErrors.port}
                >
                  <Input
                    id="mail-port"
                    type="text"
                    inputMode="numeric"
                    value={values.port}
                    invalid={fieldErrors.port !== undefined}
                    onChange={(event) => update({ port: event.target.value })}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Benutzername"
                  htmlFor="mail-username"
                  hint="Leer lassen, wenn der Server keine Anmeldung verlangt."
                >
                  <Input
                    id="mail-username"
                    type="text"
                    autoComplete="username"
                    value={values.username}
                    onChange={(event) => update({ username: event.target.value })}
                  />
                </Field>
                <Field
                  label="Passwort"
                  htmlFor="mail-password"
                  hint={
                    current.hasPassword
                      ? current.passwordReadable
                        ? 'Gespeichert. Leer lassen, um es unverändert zu lassen.'
                        : 'Gespeichert, aber auf diesem Rechner nicht lesbar — bitte neu eingeben.'
                      : 'Wird verschlüsselt abgelegt und ist an diesen Rechner gebunden.'
                  }
                >
                  <Input
                    id="mail-password"
                    type="password"
                    autoComplete="new-password"
                    value={values.password}
                    placeholder={current.hasPassword ? '•••••••• (gespeichert)' : ''}
                    onChange={(event) => update({ password: event.target.value })}
                  />
                </Field>
              </div>

              {current.hasPassword && (
                <Button
                  variant="secondary"
                  disabled={removePassword.isPending}
                  onClick={() => removePassword.mutate(values)}
                >
                  Gespeichertes Passwort löschen
                </Button>
              )}
            </div>
          )}

          {current.problems.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Der Versand ist noch nicht einsatzbereit.</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {current.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )}

          {check !== null && (
            <p
              role="status"
              className={`text-sm ${check.ok ? 'text-emerald-700' : 'text-rose-600'}`}
            >
              {check.message}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'wird gespeichert …' : 'Speichern'}
            </Button>
            {isSmtp && (
              <Button
                variant="secondary"
                disabled={checkConnection.isPending || !current.ready}
                onClick={() => checkConnection.mutate()}
              >
                {checkConnection.isPending ? 'wird geprüft …' : 'Verbindung prüfen'}
              </Button>
            )}
            {saved && <span className="text-sm text-emerald-700">Gespeichert.</span>}
            {formError !== null && (
              <span role="alert" className="text-sm text-rose-600">
                {formError}
              </span>
            )}
          </div>
        </form>
      </Card>

      <MailTemplatesCard />
    </div>
  );
}
