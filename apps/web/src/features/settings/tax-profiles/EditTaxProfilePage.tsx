import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TaxProfilePayload, TaxProfileResponse } from '@agentur-tool/shared';
import { apiClient } from '../../../lib/apiClient.js';
import { queryKeys } from '../../../lib/queryKeys.js';
import { Badge } from '../../../components/ui/Badge.js';
import { Button, buttonClassName } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog.js';
import { TaxProfileForm, toTaxProfileValues } from './TaxProfileForm.js';
import { ErrorNotice } from '../../../components/ui/ErrorNotice.js';
import { LoadingNote } from '../../../components/ui/LoadingNote.js';
import { PageHeader } from '../../../components/ui/PageHeader.js';
import { StatusText } from '../../../components/ui/StatusText.js';
import { fieldErrorsOf, formErrorOf, isNotFound } from '../../../lib/errorMessage.js';
import { useDocumentTitle } from '../../../lib/useDocumentTitle.js';

export function EditTaxProfilePage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const profileId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const profile = useQuery({
    queryKey: queryKeys.taxProfiles.byId(profileId),
    queryFn: () => apiClient.get<TaxProfileResponse>(`/tax-profiles/${profileId}`),
    enabled: Number.isInteger(profileId) && !deleted,
  });
  useDocumentTitle(profile.data?.name ?? 'Steuerprofil');

  const refresh = async (updated: TaxProfileResponse): Promise<void> => {
    queryClient.setQueryData(queryKeys.taxProfiles.byId(profileId), updated);
    await queryClient.invalidateQueries({ queryKey: queryKeys.taxProfiles.all });
  };

  const save = useMutation({
    mutationFn: (payload: TaxProfilePayload) =>
      apiClient.patch<TaxProfileResponse>(`/tax-profiles/${profileId}`, payload),
    onSuccess: async (updated) => {
      await refresh(updated);
      setSaved(true);
    },
  });

  const archive = useMutation({
    mutationFn: (archived: boolean) =>
      apiClient.post<TaxProfileResponse>(
        `/tax-profiles/${profileId}/${archived ? 'archive' : 'unarchive'}`,
        {},
      ),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: () => apiClient.delete<void>(`/tax-profiles/${profileId}`),
    onSuccess: async () => {
      setDeleted(true);
      queryClient.removeQueries({ queryKey: queryKeys.taxProfiles.byId(profileId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taxProfiles.all });
      navigate('/settings/tax-profiles', { replace: true });
    },
  });

  if (deleted || profile.isLoading) {
    return <LoadingNote>Steuerprofil wird geladen …</LoadingNote>;
  }

  if (profile.isError || profile.data === undefined) {
    return isNotFound(profile.error) ? (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-700">Dieses Steuerprofil wurde nicht gefunden.</p>
        <Link
          to="/settings/tax-profiles"
          className="mt-3 inline-block text-sm font-medium underline"
        >
          Zurück zur Übersicht
        </Link>
      </div>
    ) : (
      <ErrorNotice
        error={profile.error}
        title="Das Steuerprofil konnte nicht geladen werden."
        onRetry={() => void profile.refetch()}
      />
    );
  }

  const data = profile.data;
  const isArchived = data.archivedAt !== null;
  const usageCount = data.invoiceCount + data.customerCount;
  const removeError = formErrorOf(remove.error);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/settings/tax-profiles', label: 'Steuerprofile' }}
        title={data.name}
        badges={
          <>
            {data.isDefault && !isArchived && <Badge tone="success">Standard</Badge>}
            {isArchived && <Badge>archiviert</Badge>}
          </>
        }
        description={
          usageCount === 0
            ? 'Wird bisher nicht verwendet.'
            : 'Änderungen wirken sich nicht auf bereits ausgestellte Rechnungen aus — dort steht der eingefrorene Steuerhinweis.'
        }
      />

      {isArchived && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            Dieses Profil ist archiviert und erscheint nicht mehr in der Auswahl.
          </p>
        </div>
      )}

      <TaxProfileForm
        key={data.id}
        defaultValues={toTaxProfileValues(data)}
        submitLabel="Änderungen speichern"
        isSubmitting={save.isPending}
        onSubmit={(payload) => {
          setSaved(false);
          save.mutate(payload);
        }}
        fieldErrors={fieldErrorsOf(save.error)}
        generalError={formErrorOf(save.error)}
        secondaryActions={
          <Link to="/settings/tax-profiles" className={buttonClassName('secondary')}>
            Abbrechen
          </Link>
        }
        status={saved ? <StatusText tone="success">Gespeichert.</StatusText> : null}
      />

      <Card
        title="Profil verwalten"
        description="Archivierte Profile bleiben erhalten, damit bestehende Entwürfe und Kundenvorgaben ihre Zuordnung behalten."
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
            ) : usageCount === 0 ? null : (
              <span className="text-slate-500">
                Endgültiges Löschen ist nicht möglich, solange Rechnungen oder Kunden dieses Profil
                verwenden.
              </span>
            )}
          </div>

          {usageCount === 0 && (
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
        title="Steuerprofil endgültig löschen"
        description={`„${data.name}" wird gelöscht. Das lässt sich nicht rückgängig machen.`}
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
