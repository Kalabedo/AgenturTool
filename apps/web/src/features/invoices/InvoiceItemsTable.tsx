import { type UseFieldArrayReturn, type UseFormReturn } from 'react-hook-form';
import { DISCOUNT_TYPE, formatCents, type InvoiceCalculation } from '@agentur-tool/shared';
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
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
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
          <tbody className="divide-y divide-slate-100">
            {fields.map((field, index) => (
              <tr key={field.id} className="align-top">
                <td className="px-2 py-2 pt-4 text-slate-400">{index + 1}</td>

                <td className="px-2 py-2">
                  <Input
                    aria-label={`Beschreibung Position ${index + 1}`}
                    invalid={errorFor(index, 'description') !== undefined}
                    {...form.register(`items.${index}.description`)}
                  />
                  {errorFor(index, 'description') !== undefined && (
                    <p className="mt-1 text-xs text-rose-600">{errorFor(index, 'description')}</p>
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
                  <Input
                    aria-label={`Einheit Position ${index + 1}`}
                    placeholder="Std."
                    {...form.register(`items.${index}.unit`)}
                  />
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
                    <p className="mt-1 text-xs text-rose-600">{errorFor(index, 'discountValue')}</p>
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

                <td className="px-2 py-2 pt-4 text-right tabular-nums text-slate-900">
                  {formatCents(calculation.items[index]?.netCents ?? 0)}
                  {(calculation.items[index]?.discountCents ?? 0) !== 0 && (
                    <span className="block text-xs text-slate-400">
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
                        className="rounded px-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label={`Position ${index + 1} nach unten`}
                        disabled={index === fields.length - 1}
                        onClick={() => move(index, index + 1)}
                        className="rounded px-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      type="button"
                      aria-label={`Position ${index + 1} entfernen`}
                      onClick={() => remove(index)}
                      className="rounded px-1 text-xs text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                    >
                      entfernen
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {fields.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                  Noch keine Positionen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 px-4 py-3">
        <Button
          variant="secondary"
          onClick={() => {
            // Der Steuersatz der letzten Zeile ist der wahrscheinlichste für
            // die nächste — sonst tippt man ihn bei jeder Position neu.
            const previous = form.getValues('items').at(-1);
            append({
              description: '',
              quantity: '1',
              unit: '',
              unitPriceCents: '',
              discountType: DISCOUNT_TYPE.PERCENT,
              discountValue: '',
              taxRateBasisPoints: previous?.taxRateBasisPoints ?? '19',
            });
          }}
        >
          Position hinzufügen
        </Button>
      </div>
    </div>
  );
}
