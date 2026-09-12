import { type UseFieldArrayReturn, type UseFormReturn } from 'react-hook-form';
import {
  DEFAULT_UNIT_CODE,
  UNIT_CODE_LABELS,
  UNIT_CODE_VALUES,
  DISCOUNT_TYPE,
  formatCents,
  type InvoiceCalculation,
  type UnitCode,
} from '@agentur-tool/shared';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Select } from '../../components/ui/Select.js';
import type { InvoiceFormValues } from './invoiceFormValues.js';

interface InvoiceItemsTableProps {
  form: UseFormReturn<InvoiceFormValues, unknown, never>;
  fieldArray: UseFieldArrayReturn<InvoiceFormValues, 'items', 'id'>;
  calculation: InvoiceCalculation;
  fieldErrors?: Record<string, string>;
}

export function InvoiceItemsTable({
  form,
  fieldArray,
  calculation,
  fieldErrors,
}: InvoiceItemsTableProps): JSX.Element {
  const { fields, append, remove, move } = fieldArray;
  const errors = form.formState.errors.items;

  const errorFor = (
    index: number,
    field: keyof InvoiceFormValues['items'][number],
  ): string | undefined =>
    fieldErrors?.[`items.${index}.${field}`] ?? errors?.[index]?.[field]?.message;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b border-border bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-subtle">
            <tr>
              <th className="w-8 px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Beschreibung</th>
              <th className="w-20 px-2 py-2 font-medium">Menge</th>
              <th className="w-24 px-2 py-2 font-medium">Einheit</th>
              <th className="w-28 px-2 py-2 font-medium">Einzelpreis</th>
              <th className="w-36 px-2 py-2 font-medium">Rabatt</th>
              <th className="w-20 px-2 py-2 font-medium">Steuer</th>
              <th className="w-28 px-2 py-2 text-right font-medium">Netto</th>
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {fields.map((field, index) => (
              <tr key={field.id} className="align-top">
                <td className="px-2 py-2 pt-4 text-ink-faint">{index + 1}</td>

                <td className="px-2 py-2">
                  <Input
                    aria-label={`Beschreibung Position ${index + 1}`}
                    invalid={errorFor(index, 'description') !== undefined}
                    {...form.register(`items.${index}.description`)}
                  />
                  {errorFor(index, 'description') !== undefined && (
                    <p className="mt-1 text-xs text-danger-strong">
                      {errorFor(index, 'description')}
                    </p>
                  )}
                </td>

                <td className="px-2 py-2">
                  <Input
                    aria-label={`Menge Position ${index + 1}`}
                    inputMode="decimal"
                    className="text-right"
                    invalid={errorFor(index, 'quantity') !== undefined}
                    {...form.register(`items.${index}.quantity`)}
                  />
                </td>

                <td className="px-2 py-2">
                  {/*
                    Zwei Felder, eine Spalte: Oben steht, was gedruckt wird
                    — Freitext, wie eh und je. Darunter der Code, den die
                    E-Rechnung braucht und den niemand tippen will. Das
                    Etikett zu ersetzen hätte das Aussehen bestehender
                    Rechnungen verändert (D-E3).
                  */}
                  <Input
                    aria-label={`Einheit Position ${index + 1}`}
                    placeholder="Std."
                    {...form.register(`items.${index}.unit`)}
                  />
                  <Select
                    aria-label={`Einheit für die E-Rechnung, Position ${index + 1}`}
                    className="mt-1 text-xs"
                    {...form.register(`items.${index}.unitCode`)}
                  >
                    {UNIT_CODE_VALUES.map((code) => (
                      <option key={code} value={code}>
                        {UNIT_CODE_LABELS[code as UnitCode]}
                      </option>
                    ))}
                  </Select>
                </td>

                <td className="px-2 py-2">
                  <Input
                    aria-label={`Einzelpreis Position ${index + 1}`}
                    inputMode="decimal"
                    className="text-right"
                    invalid={errorFor(index, 'unitPriceCents') !== undefined}
                    {...form.register(`items.${index}.unitPriceCents`)}
                  />
                </td>

                <td className="px-2 py-2">
                  <div className="flex gap-1">
                    <Input
                      aria-label={`Rabatt Position ${index + 1}`}
                      inputMode="decimal"
                      className="text-right"
                      invalid={errorFor(index, 'discountValue') !== undefined}
                      {...form.register(`items.${index}.discountValue`)}
                    />
                    <Select
                      aria-label={`Rabattart Position ${index + 1}`}
                      className="w-16 px-1"
                      {...form.register(`items.${index}.discountType`)}
                    >
                      <option value={DISCOUNT_TYPE.PERCENT}>%</option>
                      <option value={DISCOUNT_TYPE.AMOUNT}>€</option>
                    </Select>
                  </div>
                  {errorFor(index, 'discountValue') !== undefined && (
                    <p className="mt-1 text-xs text-danger-strong">
                      {errorFor(index, 'discountValue')}
                    </p>
                  )}
                </td>

                <td className="px-2 py-2">
                  <Input
                    aria-label={`Steuersatz Position ${index + 1}`}
                    inputMode="decimal"
                    className="text-right"
                    invalid={errorFor(index, 'taxRateBasisPoints') !== undefined}
                    {...form.register(`items.${index}.taxRateBasisPoints`)}
                  />
                </td>

                <td className="px-2 py-2 pt-4 text-right tabular-nums text-ink">
                  {formatCents(calculation.items[index]?.netCents ?? 0)}
                  {(calculation.items[index]?.discountCents ?? 0) !== 0 && (
                    <span className="block text-xs text-ink-faint">
                      −{formatCents(calculation.items[index]?.discountCents ?? 0)}
                    </span>
                  )}
                </td>

                <td className="px-2 py-2 pt-3">
                  <div className="flex flex-col items-end gap-0.5">
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        aria-label={`Position ${index + 1} nach oben`}
                        disabled={index === 0}
                        onClick={() => move(index, index - 1)}
                        className="rounded px-1 text-xs text-ink-faint hover:bg-surface-raised hover:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label={`Position ${index + 1} nach unten`}
                        disabled={index === fields.length - 1}
                        onClick={() => move(index, index + 1)}
                        className="rounded px-1 text-xs text-ink-faint hover:bg-surface-raised hover:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      type="button"
                      aria-label={`Position ${index + 1} entfernen`}
                      onClick={() => remove(index)}
                      className="rounded px-1 text-xs text-ink-faint hover:bg-danger-surface hover:text-danger-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-border"
                    >
                      entfernen
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {fields.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-ink-subtle">
                  Noch keine Positionen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border px-4 py-3">
        <Button
          variant="secondary"
          onClick={() => {
            // Der Steuersatz der letzten Zeile ist der wahrscheinlichste für
            // die nächste — sonst tippt man ihn bei jeder Position neu.
            const previous = form.getValues('items').at(-1);
            const index = fields.length;
            append({
              description: '',
              quantity: '1',
              unit: '',
              unitCode: DEFAULT_UNIT_CODE,
              unitPriceCents: '',
              discountType: DISCOUNT_TYPE.PERCENT,
              discountValue: '',
              taxRateBasisPoints: previous?.taxRateBasisPoints ?? '19',
            });

            // Der Cursor springt in die neue Zeile. Ohne das müsste man nach
            // jedem Klick erst wieder ins Feld tippen oder sich dorthin
            // tabben — bei einer Rechnung mit zehn Positionen zehnmal.
            // Über den Namen statt über eine Ref, weil react-hook-form die
            // Felder selbst registriert und erst der nächste Frame sie kennt.
            requestAnimationFrame(() => {
              document
                .querySelector<HTMLInputElement>(`input[name="items.${index}.description"]`)
                ?.focus();
            });
          }}
        >
          Position hinzufügen
        </Button>
      </div>
    </div>
  );
}
