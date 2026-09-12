import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CustomerPayload, CustomerResponse } from '@agentur-tool/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button, buttonClassName } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import { CustomerForm, toCustomerValues } from './CustomerForm.js';
import { ErrorNotice } from '../../components/ui/ErrorNotice.js';
import { LoadingNote } from '../../components/ui/LoadingNote.js';
import { PageHeader } from '../../components/ui/PageHeader.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { useToast } from '../../components/ui/Toast.js';
import { fieldErrorsOf, formErrorOf, isNotFound } from '../../lib/errorMessage.js';
import { useDocumentTitle } from '../../lib/useDocumentTitle.js';

export function EditCustomerPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  useDocumentTitle(customer.data?.companyName ?? 'Kunde');

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
    onSuccess: async (updated) => {
      await invalidate(updated);
      toast.success(
        updated.archivedAt === null
          ? `„${updated.companyName}" ist wieder aktiv.`
          : `„${updated.companyName}" wurde archiviert und erscheint nicht mehr in der Auswahl.`,
      );
    },
  });

  const remove = useMutation({
    mutationFn: () => apiClient.delete<void>(`/customers/${customerId}`),
    onSuccess: async () => {
      const name = customer.data?.companyName ?? 'Der Kunde';
      setDeleted(true);
      queryClient.removeQueries({ queryKey: queryKeys.customers.byId(customerId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      navigate('/customers', { replace: true });
      // In der Liste angekommen, ist der einzige Beleg fürs Löschen eine
      // Zeile, die fehlt — und die fällt bei vielen Kunden niemandem auf.
      toast.success(`„${name}" wurde gelöscht.`);
    },
  });

  if (deleted || customer.isLoading) {
    return <LoadingNote>Kunde wird geladen …</LoadingNote>;
  }

  if (customer.isError || customer.data === undefined) {
    // Zwei verschiedene Lagen, zwei verschiedene Antworten: „gibt es nicht"
    // führt zurück zur Liste, „geht gerade nicht" lädt noch einmal.
    return isNotFound(customer.error) ? (
      <div className="rounded-lg border border-border bg-surface p-5">
        <p className="text-sm text-ink-muted">Dieser Kunde wurde nicht gefunden.</p>
        <Link to="/customers" className="mt-3 inline-block text-sm font-medium underline">
          Zurück zur Kundenliste
        </Link>
      </div>
    ) : (
      <ErrorNotice
        error={customer.error}
        title="Der Kunde konnte nicht geladen werden."
        onRetry={() => void customer.refetch()}
      />
    );
  }

  const data = customer.data;
  const isArchived = data.archivedAt !== null;
  const canDelete = data.invoiceCount === 0;
  const removeError = formErrorOf(remove.error);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/customers', label: 'Kunden' }}
        title={data.companyName}
        badges={isArchived ? <Badge>archiviert</Badge> : undefined}
        description={
          data.invoiceCount === 0
            ? 'Noch keine Rechnungen.'
            : `${data.invoiceCount} Rechnung(en) — Änderungen wirken sich nicht auf bereits ausgestellte Rechnungen aus.`
        }
      />

      {isArchived && (
        <div className="rounded-lg border border-attention-border bg-attention-surface p-4">
          <p className="text-sm text-attention-ink">
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
        fieldErrors={fieldErrorsOf(save.error)}
        generalError={formErrorOf(save.error)}
        secondaryActions={
          <Link to="/customers" className={buttonClassName('secondary')}>
            Abbrechen
          </Link>
        }
        status={saved ? <StatusText tone="success">Gespeichert.</StatusText> : null}
      />

      <Card
        title="Kunde verwalten"
        description="Archivierte Kunden bleiben erhalten, tauchen aber nicht mehr in der Auswahl auf."
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button
            variant="secondary"
            onClick={() => archive.mutate(!isArchived)}
            disabled={archive.isPending}
          >
            {isArchived ? 'Wieder aktivieren' : 'Archivieren'}
          </Button>

          <div className="min-h-[1.25rem] min-w-0 flex-1 text-sm">
            {removeError !== null ? (
              <StatusText tone="error">{removeError}</StatusText>
            ) : canDelete ? null : (
              <span className="text-ink-subtle">
                Endgültiges Löschen ist nicht möglich, solange Rechnungen auf diesen Kunden
                verweisen.
              </span>
            )}
          </div>

          {/* Rechts außen und abgesetzt — überall in der Anwendung steht
              dort, was sich nicht zurücknehmen lässt. */}
          {canDelete && (
            <Button
              variant="danger"
              pending={remove.isPending}
              pendingLabel="wird gelöscht …"
              onClick={() => setConfirmDelete(true)}
            >
              Endgültig löschen
            </Button>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title="Kunde endgültig löschen"
        description={`„${data.companyName}" wird gelöscht. Das lässt sich nicht rückgängig machen.`}
        confirmLabel="Endgültig löschen"
        pendingLabel="wird gelöscht …"
        tone="danger"
        isPending={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
