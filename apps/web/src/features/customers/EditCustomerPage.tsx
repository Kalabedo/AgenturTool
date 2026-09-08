import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CustomerPayload, CustomerResponse } from '@agentur-tool/shared';
import { ApiRequestError, apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Button } from '../../components/ui/Button.js';
import { CustomerForm, toCustomerValues } from './CustomerForm.js';

export function EditCustomerPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  // Sobald der Kunde gelöscht ist, darf die Detailabfrage nicht mehr laufen.
  // Sie wäre sonst eine Anfrage, die garantiert mit 404 endet — und React
  // Query lädt eine aktiv beobachtete Abfrage sofort neu, auch wenn man sie
  // aus dem Cache wirft.
  const [deleted, setDeleted] = useState(false);

  const customer = useQuery({
    queryKey: queryKeys.customers.byId(customerId),
    queryFn: () => apiClient.get<CustomerResponse>(`/customers/${customerId}`),
    enabled: Number.isInteger(customerId) && !deleted,
  });

  const invalidate = async (updated: CustomerResponse): Promise<void> => {
    queryClient.setQueryData(queryKeys.customers.byId(customerId), updated);
    await queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
  };

  const save = useMutation({
    mutationFn: (payload: CustomerPayload) =>
      apiClient.patch<CustomerResponse>(`/customers/${customerId}`, payload),
    onSuccess: async (updated) => {
      await invalidate(updated);
      setSaved(true);
    },
  });

  const archive = useMutation({
    mutationFn: (archived: boolean) =>
      apiClient.post<CustomerResponse>(
        `/customers/${customerId}/${archived ? 'archive' : 'unarchive'}`,
        {},
      ),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => apiClient.delete<void>(`/customers/${customerId}`),
    onSuccess: async () => {
      setDeleted(true);
      queryClient.removeQueries({ queryKey: queryKeys.customers.byId(customerId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      navigate('/customers', { replace: true });
    },
  });

  if (deleted || customer.isLoading) {
    return <p className="text-sm text-slate-500">Kunde wird geladen …</p>;
  }

  if (customer.isError || customer.data === undefined) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-5">
        <p className="text-sm text-rose-800">Dieser Kunde wurde nicht gefunden.</p>
        <Link to="/customers" className="mt-3 inline-block text-sm font-medium underline">
          Zurück zur Kundenliste
        </Link>
      </div>
    );
  }

  const data = customer.data;
  const isArchived = data.archivedAt !== null;
  const canDelete = data.invoiceCount === 0;
  const saveError = save.error instanceof ApiRequestError ? save.error : null;
  const removeError = remove.error instanceof ApiRequestError ? remove.error : null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/customers" className="text-sm text-slate-500 hover:underline">
          ← Kunden
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{data.companyName}</h1>
          {isArchived && (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              archiviert
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {data.invoiceCount === 0
            ? 'Noch keine Rechnungen.'
            : `${data.invoiceCount} Rechnung(en) — Änderungen wirken sich nicht auf bereits ausgestellte Rechnungen aus.`}
        </p>
      </div>

      {isArchived && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            Dieser Kunde ist archiviert und erscheint nicht mehr in der Auswahl beim Erstellen einer
            Rechnung.
          </p>
        </div>
      )}

      <CustomerForm
        // Der Schlüssel erzwingt einen frischen Formularzustand, wenn zwischen
        // zwei Kunden gewechselt wird — sonst blieben die alten Werte stehen.
        key={data.id}
        defaultValues={toCustomerValues(data)}
        submitLabel="Änderungen speichern"
        isSubmitting={save.isPending}
        onSubmit={(payload) => {
          setSaved(false);
          save.mutate(payload);
        }}
        fieldErrors={saveError?.fieldErrors()}
        generalError={
          saveError !== null && Object.keys(saveError.fieldErrors()).length === 0
            ? saveError.message
            : null
        }
        secondaryActions={
          saved ? <span className="text-sm text-emerald-700">Gespeichert.</span> : null
        }
      />

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">Kunde verwalten</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Archivierte Kunden bleiben erhalten, tauchen aber nicht mehr in der Auswahl auf.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => archive.mutate(!isArchived)}
            disabled={archive.isPending}
          >
            {isArchived ? 'Wieder aktivieren' : 'Archivieren'}
          </Button>

          {canDelete && (
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `„${data.companyName}" endgültig löschen? Das lässt sich nicht rückgängig machen.`,
                  )
                ) {
                  remove.mutate();
                }
              }}
            >
              Endgültig löschen
            </Button>
          )}

          {!canDelete && (
            <span className="text-sm text-slate-500">
              Endgültiges Löschen ist nicht möglich, solange Rechnungen auf diesen Kunden verweisen.
            </span>
          )}
        </div>

        {removeError !== null && (
          <p className="mt-3 text-sm text-rose-600">{removeError.message}</p>
        )}
      </div>
    </div>
  );
}
