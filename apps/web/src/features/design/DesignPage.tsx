import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DESIGN_SAMPLE_INVOICE,
  DESIGN_SAMPLE_LOGO,
  TEMPLATE_DENSITY_VALUES,
  TEMPLATE_FONT_FAMILY_VALUES,
  templateSnapshotFromSettings,
  updateTemplateSettingsSchema,
  type CompanyResponse,
  type TemplateSettingsResponse,
  type UpdateTemplateSettingsInput,
  type UpdateTemplateSettingsPayload,
} from '@privatura/shared';
import { buildRenderModel, embeddedFontCss, resolveTemplate } from '@privatura/invoice-template';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { useDocumentTitle } from '../../lib/useDocumentTitle.js';
import { useRemainingViewportHeight } from '../../lib/useRemainingViewportHeight.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { Checkbox } from '../../components/ui/Checkbox.js';
import { ErrorNotice } from '../../components/ui/ErrorNotice.js';
import { Field } from '../../components/ui/Field.js';
import { FormActions } from '../../components/ui/FormActions.js';
import { Input } from '../../components/ui/Input.js';
import { LoadingNote } from '../../components/ui/LoadingNote.js';
import { PageHeader } from '../../components/ui/PageHeader.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.js';
import { Select } from '../../components/ui/Select.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { Textarea } from '../../components/ui/Textarea.js';
import { TemplateFrame } from '../../components/TemplateFrame.js';
import { ColorField } from './ColorField.js';
import { DesignPicker } from './DesignPicker.js';

type FormValues = UpdateTemplateSettingsInput;

const DENSITY_LABELS: Record<(typeof TEMPLATE_DENSITY_VALUES)[number], string> = {
  kompakt: 'Kompakt',
  normal: 'Normal',
  luftig: 'Luftig',
};

/** Die Vorgaben, auf die „Zurücksetzen" bei einer Farbe zurückgeht. */
const COLOR_DEFAULTS = {
  accentColor: '#1e293b',
  inkColor: '#1f2328',
  inkSoftColor: '#4b5563',
  ruleColor: '#e3e6ea',
  bandColor: '#f4f5f7',
  pageColor: '#ffffff',
} as const;

function toFormValues(settings: TemplateSettingsResponse): FormValues {
  return {
    templateKey: settings.templateKey,
    accentColor: settings.accentColor,
    fontFamily: settings.fontFamily,
    logoWidthMm: String(settings.logoWidthMm),
    inkColor: settings.inkColor,
    inkSoftColor: settings.inkSoftColor,
    ruleColor: settings.ruleColor,
    bandColor: settings.bandColor,
    pageColor: settings.pageColor,
    density: settings.density,
    showLogo: settings.showLogo,
    showPaymentBlock: settings.showPaymentBlock,
    showFooterRule: settings.showFooterRule,
    footerText: settings.footerText ?? '',
    paymentNote: settings.paymentNote ?? '',
    closingNote: settings.closingNote ?? '',
  };
}

/**
 * Der Rechnungsdesigner.
 *
 * Ein eigener Bereich und kein Reiter unter den Einstellungen, weil hier
 * etwas anderes passiert als dort: Man stellt nicht einen Wert ein und geht
 * wieder, man schaut beim Einstellen zu. Dafür braucht die Vorschau Platz.
 *
 * Regler und Vorschau scrollen unabhängig voneinander, jede Spalte in ihrem
 * eigenen Kasten. Vorher scrollte die Seite als Ganzes und die Vorschau
 * klebte oben fest — was bei kurzen Rechnungen aussah wie zwei getrennte
 * Bereiche, bei langen aber nicht mehr: Die Vorschau lief unten aus dem Bild,
 * und um ihr Ende zu sehen, musste man die Regler bis zum Anschlag
 * durchscrollen.
 *
 * Zwei Dinge sind bewusst getrennt: Die Vorschau folgt jedem Tastendruck,
 * gespeichert wird erst auf Knopfdruck. Die Einstellungen gelten für **jeden
 * offenen Entwurf** und werden beim Ausstellen eingefroren — ein
 * versehentlich verschobener Regler dürfte nicht stillschweigend verändern,
 * wie die nächste echte Rechnung aussieht.
 *
 * Was hier eingestellt wird, verändert **keine bereits ausgestellte
 * Rechnung**. Die trägt ihren eigenen Snapshot; das ist der Grund, warum es
 * hier Regler und kein freies CSS gibt.
 */
export function DesignPage(): JSX.Element {
  useDocumentTitle('PDF-Design');
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  /*
   * Die beiden Spalten füllen den Rest des Fensters und scrollen darin
   * selbst. Gemessen statt gerechnet, siehe den Hook — über dem Formular
   * stehen Kopfzeile und Seitenkopf, deren Höhe hier niemand kennen soll.
   * Unten bleibt so viel Luft, wie `main` ohnehin als Abstand hat (py-8).
   */
  const formRef = useRef<HTMLFormElement>(null);
  const paneHeight = useRemainingViewportHeight(formRef, 32);

  const settings = useQuery({
    queryKey: queryKeys.templateSettings,
    queryFn: () => apiClient.get<TemplateSettingsResponse>('/template-settings'),
  });

  const company = useQuery({
    queryKey: queryKeys.company,
    queryFn: () => apiClient.get<CompanyResponse>('/company'),
  });

  const form = useForm<FormValues, unknown, UpdateTemplateSettingsPayload>({
    resolver: zodResolver(updateTemplateSettingsSchema),
    values: settings.data === undefined ? undefined : toFormValues(settings.data),
  });

  const save = useMutation({
    mutationFn: (payload: UpdateTemplateSettingsPayload) =>
      apiClient.put<TemplateSettingsResponse>('/template-settings', payload),
    onSuccess: (updated) => {
      // setQueryData statt invalidateQueries: Ein offener Rechnungseditor
      // übernimmt das neue Design dann ohne Nachladen.
      queryClient.setQueryData(queryKeys.templateSettings, updated);
      form.reset(toFormValues(updated));
      setSaved(true);
    },
  });

  if (settings.isPending) return <LoadingNote>Design wird geladen …</LoadingNote>;
  if (settings.isError) {
    return (
      <ErrorNotice
        error={settings.error}
        title="Das Design ließ sich nicht laden."
        onRetry={() => void settings.refetch()}
      />
    );
  }

  /*
   * Die Vorschau folgt dem Formular, nicht dem gespeicherten Stand. `watch()`
   * abonniert das ganze Formular — hier unbedenklich, weil es klein ist und
   * anders als die Positionstabelle kein an Ort und Stelle verändertes Feld
   * enthält.
   */
  const watched = form.watch();

  /*
   * Die Eingabewerte des Schemas sind allesamt optional — es setzt die
   * Vorgaben beim Absenden selbst ein. Vorschau und Regler brauchen sie
   * aber jetzt schon als Wert, deshalb hier einmal aufgefüllt statt an
   * fünfzehn Stellen mit `??` bestreut.
   */
  const stored = settings.data;
  const values = {
    templateKey: watched.templateKey ?? stored.templateKey,
    accentColor: watched.accentColor ?? stored.accentColor,
    fontFamily: watched.fontFamily ?? stored.fontFamily,
    logoWidthMm: watched.logoWidthMm ?? String(stored.logoWidthMm),
    inkColor: watched.inkColor ?? stored.inkColor,
    inkSoftColor: watched.inkSoftColor ?? stored.inkSoftColor,
    ruleColor: watched.ruleColor ?? stored.ruleColor,
    bandColor: watched.bandColor ?? stored.bandColor,
    pageColor: watched.pageColor ?? stored.pageColor,
    density: watched.density ?? stored.density,
    showLogo: watched.showLogo ?? stored.showLogo,
    showPaymentBlock: watched.showPaymentBlock ?? stored.showPaymentBlock,
    showFooterRule: watched.showFooterRule ?? stored.showFooterRule,
    footerText: watched.footerText ?? '',
    paymentNote: watched.paymentNote ?? '',
    closingNote: watched.closingNote ?? '',
  };

  /*
   * Der Entwurf für die Vorschau. Das Schema `parse`t hier nicht: Während
   * jemand eine Hex-Farbe tippt, steht dort zwangsläufig kurzzeitig Unsinn,
   * und eine Vorschau, die dabei verschwindet, wäre unbrauchbar. Ungültige
   * Werte landen einfach als solche im CSS, wo der Browser sie ignoriert.
   */
  const preview = templateSnapshotFromSettings({
    ...stored,
    templateKey: values.templateKey,
    accentColor: values.accentColor,
    fontFamily: values.fontFamily,
    logoWidthMm: Number(String(values.logoWidthMm).replace(',', '.')) || 40,
    inkColor: values.inkColor,
    inkSoftColor: values.inkSoftColor,
    ruleColor: values.ruleColor,
    bandColor: values.bandColor,
    pageColor: values.pageColor,
    density: values.density,
    showLogo: values.showLogo,
    showPaymentBlock: values.showPaymentBlock,
    showFooterRule: values.showFooterRule,
    footerText: values.footerText,
    paymentNote: values.paymentNote,
    closingNote: values.closingNote,
  });

  const design = resolveTemplate(preview.templateKey);
  const { colors, blocks, density: hasDensity, logoWidth } = design.capabilities;

  const sample = {
    ...DESIGN_SAMPLE_INVOICE,
    // Das eigene Logo, sobald es eines gibt — sonst ein neutrales.
    logoSrc: company.data?.logoUrl ?? DESIGN_SAMPLE_LOGO,
  };

  const model = buildRenderModel({ ...sample, template: preview });

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/invoices', label: 'Rechnungen' }}
        title="PDF-Design"
        description="Wie Ihre Rechnungen aussehen. Bereits ausgestellte Rechnungen bleiben davon unberührt — sie tragen das Aussehen vom Tag ihrer Ausstellung."
      />

      <form
        ref={formRef}
        onSubmit={form.handleSubmit((payload) => {
          setSaved(false);
          save.mutate(payload);
        })}
        className="grid grid-cols-1 gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]"
        /*
         * Nur ab `lg`: Darunter stehen die Spalten untereinander, und zwei
         * Scrollkästen in einer Spalte wären auf einem schmalen Bildschirm
         * eine Zumutung. Dort scrollt weiterhin die Seite.
         */
        style={paneHeight === undefined ? undefined : { ['--pane-h' as string]: `${paneHeight}px` }}
      >
        {/*
         * `min-h-0` ist nicht schmückend: Ohne das bekommt ein Grid-Element
         * als Mindesthöhe seinen Inhalt, die Höhenvorgabe verpufft und der
         * Kasten scrollt nie.
         */}
        <div className="flex min-h-0 flex-col lg:h-[var(--pane-h)]">
          <div className="min-h-0 flex-1 space-y-5 lg:overflow-y-auto lg:pr-3">
            <Card title="Vorlage" description="Vier Aufbauten, dieselben Angaben.">
              <DesignPicker
                value={values.templateKey}
                onChange={(key) =>
                  form.setValue('templateKey', key as FormValues['templateKey'], {
                    shouldDirty: true,
                  })
                }
                sample={{ ...sample, items: sample.items.slice(0, 3) }}
                template={preview}
              />
            </Card>

            <Card title="Farben">
              <div className="space-y-4">
                <ColorField
                  label="Akzent"
                  hint="Überschriften und hervorgehobene Stellen."
                  value={values.accentColor}
                  fallback={COLOR_DEFAULTS.accentColor}
                  onChange={(v) => form.setValue('accentColor', v, { shouldDirty: true })}
                  error={form.formState.errors.accentColor?.message}
                />
                <ColorField
                  label="Text"
                  value={values.inkColor}
                  fallback={COLOR_DEFAULTS.inkColor}
                  disabled={!colors.includes('ink')}
                  onChange={(v) => form.setValue('inkColor', v, { shouldDirty: true })}
                  error={form.formState.errors.inkColor?.message}
                />
                <ColorField
                  label="Nebentext"
                  hint="Beschriftungen, Einheiten, Fußtext."
                  value={values.inkSoftColor}
                  fallback={COLOR_DEFAULTS.inkSoftColor}
                  disabled={!colors.includes('inkSoft')}
                  onChange={(v) => form.setValue('inkSoftColor', v, { shouldDirty: true })}
                  error={form.formState.errors.inkSoftColor?.message}
                />
                <ColorField
                  label="Linien"
                  value={values.ruleColor}
                  fallback={COLOR_DEFAULTS.ruleColor}
                  disabled={!colors.includes('rule')}
                  onChange={(v) => form.setValue('ruleColor', v, { shouldDirty: true })}
                  error={form.formState.errors.ruleColor?.message}
                />
                <ColorField
                  label="Flächen"
                  hint="Tabellenkopf und Gesamtbetrag."
                  value={values.bandColor}
                  fallback={COLOR_DEFAULTS.bandColor}
                  disabled={!colors.includes('band')}
                  onChange={(v) => form.setValue('bandColor', v, { shouldDirty: true })}
                  error={form.formState.errors.bandColor?.message}
                />
                <ColorField
                  label="Seitenhintergrund"
                  hint="Grundfarbe des PDF-Dokuments."
                  value={values.pageColor}
                  fallback={COLOR_DEFAULTS.pageColor}
                  onChange={(v) => form.setValue('pageColor', v, { shouldDirty: true })}
                  error={form.formState.errors.pageColor?.message}
                />
              </div>
            </Card>

            <Card title="Schrift und Dichte">
              <div className="space-y-4">
                <Field
                  label="Schrift"
                  hint="Mitgeliefert, damit PDF und Vorschau gleich umbrechen."
                >
                  <Select {...form.register('fontFamily')}>
                    {TEMPLATE_FONT_FAMILY_VALUES.map((family) => (
                      <option key={family} value={family}>
                        {family}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="Dichte"
                  hint={
                    hasDensity
                      ? 'Wie eng die Positionen stehen — und damit, wie viele auf eine Seite passen.'
                      : 'Dieses Design setzt eine feste Dichte.'
                  }
                >
                  <SegmentedControl
                    label="Dichte"
                    value={values.density}
                    onChange={(v) => form.setValue('density', v, { shouldDirty: true })}
                    options={TEMPLATE_DENSITY_VALUES.map((value) => ({
                      value,
                      label: DENSITY_LABELS[value],
                    }))}
                  />
                </Field>
              </div>
            </Card>

            <Card title="Blöcke" description="Was auf dem Dokument erscheint.">
              <div className="space-y-3">
                <Checkbox
                  label="Logo zeigen"
                  checked={values.showLogo}
                  onChange={(event) =>
                    form.setValue('showLogo', event.target.checked, { shouldDirty: true })
                  }
                />
                {logoWidth && values.showLogo && (
                  <Field
                    label="Logobreite"
                    hint="10 bis 80 Millimeter."
                    error={form.formState.errors.logoWidthMm?.message}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={10}
                        max={80}
                        step={1}
                        value={Number(String(values.logoWidthMm).replace(',', '.')) || 40}
                        onChange={(event) =>
                          form.setValue('logoWidthMm', event.target.value, { shouldDirty: true })
                        }
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-raised accent-ink"
                        aria-label="Logobreite in Millimetern"
                      />
                      <Input {...form.register('logoWidthMm')} className="w-20 text-right" />
                      <span className="text-sm text-ink-subtle">mm</span>
                    </div>
                  </Field>
                )}
                <Checkbox
                  label="Zahlungsdetails im Kopf"
                  checked={values.showPaymentBlock}
                  onChange={(event) =>
                    form.setValue('showPaymentBlock', event.target.checked, { shouldDirty: true })
                  }
                />
                {blocks.includes('footerRule') && (
                  <Checkbox
                    label="Linie über dem Fußtext"
                    checked={values.showFooterRule}
                    onChange={(event) =>
                      form.setValue('showFooterRule', event.target.checked, { shouldDirty: true })
                    }
                  />
                )}
              </div>
            </Card>

            <Card title="Texte" description="Erscheinen auf jeder Rechnung.">
              <div className="space-y-4">
                <Field label="Zahlungshinweis" hint="Steht unter den Summen.">
                  <Textarea rows={2} {...form.register('paymentNote')} />
                </Field>
                <Field label="Schlusssatz">
                  <Textarea rows={2} {...form.register('closingNote')} />
                </Field>
                <Field label="Fußtext" hint="Ganz unten, mittig — etwa Registergericht.">
                  <Textarea rows={2} {...form.register('footerText')} />
                </Field>
              </div>
            </Card>
          </div>

          {/*
             Außerhalb des Scrollkastens: „Speichern" steht am Fuß der Spalte
             und bleibt sichtbar, egal bei welchem Regler man gerade ist. In
             einer Spalte, die selbst scrollt, wäre eine Schaltfläche ganz
             unten sonst dauerhaft aus dem Bild.
          */}
          <div className="shrink-0 space-y-4 pt-5 lg:border-t lg:border-border lg:pr-3 lg:pt-4">
            {save.isError && (
              <ErrorNotice error={save.error} title="Das Design ließ sich nicht speichern." />
            )}

            <FormActions>
              <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>
                {save.isPending ? 'Wird gespeichert …' : 'Speichern'}
              </Button>
              {saved && !form.formState.isDirty && (
                <StatusText tone="success">Gespeichert.</StatusText>
              )}
              {form.formState.isDirty && (
                <StatusText tone="muted">Noch nicht gespeichert.</StatusText>
              )}
            </FormActions>
          </div>
        </div>

        {/* Die Vorschau scrollt für sich — lange Rechnungen erreicht man,
            ohne die Regler anzurühren. Die abgesetzte Arbeitsfläche lässt
            das mittig liegende weiße A4-Blatt als Papier erkennen. */}
        <div className="min-h-0 rounded-xl border border-border bg-surface-raised p-4 sm:p-6 lg:h-[var(--pane-h)] lg:overflow-y-auto">
          <TemplateFrame
            css={`
              ${embeddedFontCss(preview.fontFamily)}${design.css}
            `}
            title="Vorschau des Rechnungsdesigns"
          >
            {design.render(model)}
          </TemplateFrame>
          <p className="mx-auto mt-3 max-w-[794px] text-xs text-ink-subtle">
            Eine Musterrechnung — Ihre echten Rechnungen erscheinen mit ihren eigenen Angaben. Der
            Seitenumbruch entsteht erst beim Export.
          </p>
        </div>
      </form>
    </div>
  );
}
