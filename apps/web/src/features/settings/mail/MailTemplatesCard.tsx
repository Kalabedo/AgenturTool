import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MAIL_PLACEHOLDERS,
  MAIL_TEMPLATE_KEY,
  MAIL_TEMPLATE_KEY_VALUES,
  MAIL_TEMPLATE_LABELS,
  examplePlaceholderValues,
  renderMailTemplate,
  unknownPlaceholders,
  type MailTemplateKey,
  type MailTemplateResponse,
} from '@agentur-tool/shared';
import { apiClient } from '../../../lib/apiClient.js';
import { formErrorOf } from '../../../lib/errorMessage.js';
import { queryKeys } from '../../../lib/queryKeys.js';
import { Button } from '../../../components/ui/Button.js';
import { FormActions } from '../../../components/ui/FormActions.js';
import { StatusText } from '../../../components/ui/StatusText.js';
import { Card } from '../../../components/ui/Card.js';
import { ErrorNotice } from '../../../components/ui/ErrorNotice.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { LoadingNote } from '../../../components/ui/LoadingNote.js';
import { Select } from '../../../components/ui/Select.js';
import { Textarea } from '../../../components/ui/Textarea.js';

/**
 * Die Textvorlagen für Betreff und Nachricht.
 *
 * Die Vorschau daneben ist der Grund, warum das Einsetzen der Platzhalter
 * in `shared` liegt: Hier läuft dieselbe Funktion mit Beispielwerten, die
 * der Server später mit den Werten der Rechnung laufen lässt. Was die
 * Vorschau zeigt, kann deshalb nicht anders aussehen als das, was ankommt.
 *
 * Ein unbekannter Platzhalter wird beim Speichern nicht abgelehnt, sondern
 * benannt: Er bliebe im Text stehen und fiele spätestens im Versanddialog
 * auf — aber besser hier, wo man ihn gerade geschrieben hat.
 */
export function MailTemplatesCard(): JSX.Element {
  const queryClient = useQueryClient();
  const [key, setKey] = useState<MailTemplateKey>(MAIL_TEMPLATE_KEY.INVOICE);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saved, setSaved] = useState(false);

  const templates = useQuery({
    queryKey: queryKeys.mail.templates,
    queryFn: () => apiClient.get<MailTemplateResponse[]>('/mail/templates'),
  });

  const active = templates.data?.find((template) => template.key === key);

  // Beim Wechsel der Vorlage — und beim ersten Laden — übernimmt die Maske
  // den gespeicherten Stand. `active?.updatedAt` in den Abhängigkeiten sorgt
  // dafür, dass auch ein Zurücksetzen durchschlägt.
  useEffect(() => {
    if (active === undefined) return;
    setSubject(active.subject);
    setBody(active.body);
    setSaved(false);
  }, [active?.key, active?.updatedAt]);

  const save = useMutation({
    mutationFn: () =>
      apiClient.put<MailTemplateResponse>(`/mail/templates/${key}`, { subject, body }),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: queryKeys.mail.templates });
    },
  });

  const reset = useMutation({
    mutationFn: () => apiClient.post<MailTemplateResponse>(`/mail/templates/${key}/reset`, {}),
    onSuccess: async () => {
      setSaved(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.mail.templates });
    },
  });

  if (templates.isLoading) return <LoadingNote>Vorlagen werden geladen …</LoadingNote>;

  if (templates.isError) {
    return (
      <ErrorNotice
        error={templates.error}
        title="Die Vorlagen konnten nicht geladen werden."
        onRetry={() => void templates.refetch()}
      />
    );
  }

  const values = examplePlaceholderValues(key);
  const unknown = [...unknownPlaceholders(subject, key), ...unknownPlaceholders(body, key)];
  const changed = active !== undefined && (subject !== active.subject || body !== active.body);
  const saveError = formErrorOf(save.error) ?? formErrorOf(reset.error);

  return (
    <Card
      title="Vorlagen"
      description="Betreff und Nachricht, mit denen der Versanddialog vorbelegt wird."
    >
      <div className="space-y-5">
        <Field label="Vorlage" htmlFor="mail-template-key">
          <Select
            id="mail-template-key"
            value={key}
            onChange={(event) => setKey(event.target.value as MailTemplateKey)}
          >
            {MAIL_TEMPLATE_KEY_VALUES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {MAIL_TEMPLATE_LABELS[candidate as MailTemplateKey]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Betreff" htmlFor="mail-template-subject" required>
          <Input
            id="mail-template-subject"
            type="text"
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              setSaved(false);
            }}
          />
        </Field>

        <Field label="Nachricht" htmlFor="mail-template-body" required>
          <Textarea
            id="mail-template-body"
            rows={10}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setSaved(false);
            }}
          />
        </Field>

        <div>
          <h3 className="text-sm font-medium text-slate-700">Platzhalter</h3>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {MAIL_PLACEHOLDERS[key].map((placeholder) => (
              <div key={placeholder.key} className="flex gap-2">
                <dt className="shrink-0 font-mono text-xs text-slate-900">
                  {`{{${placeholder.key}}}`}
                </dt>
                <dd className="text-slate-500">{placeholder.description}</dd>
              </div>
            ))}
          </dl>
        </div>

        {unknown.length > 0 && (
          <p role="alert" className="text-sm text-amber-800">
            Unbekannt und damit unersetzt: {unknown.map((name) => `{{${name}}}`).join(', ')}. So
            stünde es wörtlich in der Nachricht.
          </p>
        )}

        <div>
          <h3 className="text-sm font-medium text-slate-700">Vorschau mit Beispielwerten</h3>
          <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-medium text-slate-900">{renderMailTemplate(subject, values)}</p>
            <p className="mt-2 whitespace-pre-wrap text-slate-700">
              {renderMailTemplate(body, values)}
            </p>
          </div>
        </div>

        <FormActions
          className="border-t border-slate-200 pt-5"
          status={
            saveError !== null ? (
              <StatusText tone="error">{saveError}</StatusText>
            ) : saved ? (
              <StatusText tone="success">Gespeichert.</StatusText>
            ) : null
          }
        >
          <Button
            disabled={!changed}
            pending={save.isPending}
            pendingLabel="wird gespeichert …"
            onClick={() => save.mutate()}
          >
            Vorlage speichern
          </Button>
          <Button
            variant="secondary"
            disabled={active?.isDefault === true && !changed}
            pending={reset.isPending}
            pendingLabel="wird zurückgesetzt …"
            onClick={() => reset.mutate()}
          >
            Auslieferungstext wiederherstellen
          </Button>
        </FormActions>
      </div>
    </Card>
  );
}
