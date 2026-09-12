import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  TAX_CATEGORY_CODE_LABELS,
  TAX_CATEGORY_CODE_VALUES,
  TAX_PROFILE_KIND,
  TAX_PROFILE_KIND_DESCRIPTIONS,
  TAX_PROFILE_KIND_LABELS,
  TAX_PROFILE_KIND_VALUES,
  allowsRateInput,
  basisPointsToPercentInput,
  requiresNoteText,
  taxProfileInputSchema,
  type TaxProfileInput,
  type TaxProfileKind,
  type TaxProfilePayload,
  type TaxProfileResponse,
  type TaxCategoryCode,
} from '@agentur-tool/shared';
import { Button } from '../../../components/ui/Button.js';
import { FormActions } from '../../../components/ui/FormActions.js';
import { StatusText } from '../../../components/ui/StatusText.js';
import { Card } from '../../../components/ui/Card.js';
import { Checkbox } from '../../../components/ui/Checkbox.js';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { Select } from '../../../components/ui/Select.js';
import { Textarea } from '../../../components/ui/Textarea.js';

type FormValues = TaxProfileInput;

export function emptyTaxProfileValues(): FormValues {
  return {
    name: '',
    kind: TAX_PROFILE_KIND.STANDARD,
    defaultRateBasisPoints: '19',
    noteText: '',
    taxCategoryCode: undefined,
    exemptionReasonCode: '',
    exemptionReasonText: '',
    showTaxColumn: true,
    isDefault: false,
    sortOrder: 0,
  };
}

export function toTaxProfileValues(profile: TaxProfileResponse): FormValues {
  return {
    name: profile.name,
    kind: profile.kind,
    defaultRateBasisPoints: basisPointsToPercentInput(profile.defaultRateBasisPoints),
    noteText: profile.noteText ?? '',
    taxCategoryCode: profile.taxCategoryCode,
    exemptionReasonCode: profile.exemptionReasonCode ?? '',
    exemptionReasonText: profile.exemptionReasonText ?? '',
    showTaxColumn: profile.showTaxColumn,
    isDefault: profile.isDefault,
    sortOrder: profile.sortOrder,
  };
}

interface TaxProfileFormProps {
  defaultValues: FormValues;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (payload: TaxProfilePayload) => void;
  secondaryActions?: ReactNode;
  /** Rückmeldung zum Speichern — steht rechts in der Leiste. */
  status?: ReactNode;
  fieldErrors?: Record<string, string>;
  generalError?: string | null;
}

export function TaxProfileForm({
  defaultValues,
  submitLabel,
  isSubmitting,
  onSubmit,
  secondaryActions,
  status,
  fieldErrors,
  generalError,
}: TaxProfileFormProps): JSX.Element {
  const form = useForm<FormValues, unknown, TaxProfilePayload>({
    resolver: zodResolver(taxProfileInputSchema),
    defaultValues,
  });

  const errors = form.formState.errors;
  const errorFor = (field: keyof FormValues): string | undefined =>
    fieldErrors?.[field] ?? errors[field]?.message;

  // Die Steuerart bestimmt, welche Felder überhaupt sinnvoll sind. Beobachtet
  // statt aus den Vorgabewerten gelesen, damit die Maske sofort reagiert.
  const kind = form.watch('kind') as TaxProfileKind;
  const showRate = allowsRateInput(kind);
  const noteRequired = requiresNoteText(kind);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Card title="Profil">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field
            label="Name"
            htmlFor="name"
            required
            error={errorFor('name')}
            className="sm:col-span-4"
          >
            <Input
              id="name"
              autoFocus
              invalid={errorFor('name') !== undefined}
              {...form.register('name')}
            />
          </Field>

          <Field
            label="Reihenfolge"
            htmlFor="sortOrder"
            error={errorFor('sortOrder')}
            hint="Kleinere Zahl zuerst"
            className="sm:col-span-2"
          >
            <Input
              id="sortOrder"
              type="number"
              min={0}
              max={9999}
              invalid={errorFor('sortOrder') !== undefined}
              {...form.register('sortOrder')}
            />
          </Field>

          <Field
            label="Steuerart"
            htmlFor="kind"
            error={errorFor('kind')}
            hint={TAX_PROFILE_KIND_DESCRIPTIONS[kind]}
            className="sm:col-span-6"
          >
            <Select id="kind" invalid={errorFor('kind') !== undefined} {...form.register('kind')}>
              {TAX_PROFILE_KIND_VALUES.map((value) => (
                <option key={value} value={value}>
                  {TAX_PROFILE_KIND_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          {showRate ? (
            <Field
              label="Steuersatz in Prozent"
              htmlFor="defaultRateBasisPoints"
              error={errorFor('defaultRateBasisPoints')}
              hint="Vorschlag für neue Positionen, z. B. 19 oder 7,5"
              className="sm:col-span-6"
            >
              <Input
                id="defaultRateBasisPoints"
                className="sm:w-32"
                invalid={errorFor('defaultRateBasisPoints') !== undefined}
                {...form.register('defaultRateBasisPoints')}
              />
            </Field>
          ) : (
            <p className="text-sm text-slate-500 sm:col-span-6">
              Bei dieser Steuerart wird kein Steuersatz ausgewiesen; er wird auf 0 gesetzt.
            </p>
          )}
        </div>
      </Card>

      <Card title="Darstellung auf der Rechnung">
        <div className="space-y-4">
          <Field
            label="Hinweistext"
            htmlFor="noteText"
            required={noteRequired}
            error={errorFor('noteText')}
            hint={
              noteRequired
                ? 'Für diese Steuerart verpflichtend — erscheint als Hinweis auf der Rechnung.'
                : 'Optionaler Zusatz, der unter den Positionen erscheint.'
            }
          >
            <Textarea
              id="noteText"
              rows={3}
              invalid={errorFor('noteText') !== undefined}
              {...form.register('noteText')}
            />
          </Field>

          <Checkbox
            id="showTaxColumn"
            label="Steuerspalte in der Positionstabelle anzeigen"
            hint="Bei Reverse Charge und Kleinunternehmern üblicherweise ausgeblendet."
            {...form.register('showTaxColumn')}
          />

          <Checkbox
            id="isDefault"
            label="Als Standardprofil verwenden"
            hint="Wird neuen Rechnungen vorgeschlagen. Es kann nur ein Standardprofil geben — ein bisheriges wird ersetzt."
            {...form.register('isDefault')}
          />
        </div>
      </Card>

      <Card
        title="E-Rechnung"
        description="Wie dieser Sachverhalt in der XRechnung ausgewiesen wird."
      >
        <div className="space-y-4">
          <Field
            label="Steuerkategorie"
            htmlFor="taxCategoryCode"
            error={errorFor('taxCategoryCode')}
            hint="Die Norm kennt mehr Fälle als die Steuerart oben. Steuerfrei kann eine innergemeinschaftliche Lieferung, eine Ausfuhr oder eine echte Befreiung sein — das weiß nur, wer die Rechnung schreibt."
          >
            <Select
              id="taxCategoryCode"
              invalid={errorFor('taxCategoryCode') !== undefined}
              {...form.register('taxCategoryCode')}
            >
              {TAX_CATEGORY_CODE_VALUES.map((code) => (
                <option key={code} value={code}>
                  {TAX_CATEGORY_CODE_LABELS[code as TaxCategoryCode]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Befreiungsgrund"
            htmlFor="exemptionReasonText"
            error={errorFor('exemptionReasonText')}
            hint="Bei jeder Kategorie außer der Regelbesteuerung verlangt. Bleibt das Feld leer, wird der Hinweistext von oben übernommen."
          >
            <Textarea
              id="exemptionReasonText"
              rows={2}
              invalid={errorFor('exemptionReasonText') !== undefined}
              {...form.register('exemptionReasonText')}
            />
          </Field>

          <Field
            label="Befreiungsgrund als Code"
            htmlFor="exemptionReasonCode"
            error={errorFor('exemptionReasonCode')}
            hint="Optional, z. B. VATEX-EU-AE für Reverse Charge. Code oder Text genügt — beides braucht es nicht."
          >
            <Input
              id="exemptionReasonCode"
              invalid={errorFor('exemptionReasonCode') !== undefined}
              {...form.register('exemptionReasonCode')}
            />
          </Field>
        </div>
      </Card>

      <FormActions
        status={
          generalError != null ? <StatusText tone="error">{generalError}</StatusText> : status
        }
      >
        <Button type="submit" pending={isSubmitting} pendingLabel="wird gespeichert …">
          {submitLabel}
        </Button>
        {secondaryActions}
      </FormActions>
    </form>
  );
}
