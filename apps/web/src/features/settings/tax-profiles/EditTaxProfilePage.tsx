import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TaxProfilePayload, TaxProfileResponse } from '@agentur-tool/shared';
import { ApiRequestError, apiClient } from '../../../lib/apiClient.js';
import { queryKeys } from '../../../lib/queryKeys.js';
import { Button } from '../../../components/ui/Button.js';
import { TaxProfileForm, toTaxProfileValues } from './TaxProfileForm.js';

export function EditTaxProfilePage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const profileId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const profile = useQuery({
    queryKey: queryKeys.taxProfiles.byId(profileId),
    queryFn: () => apiClient.get<TaxProfileResponse>(`/tax-profiles/${profileId}`),
    enabled: Number.isInteger(profileId) && !deleted,
  });

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
    return <p className="text-sm text-slate-500">Steuerprofil wird geladen …</p>;
  }

  if (profile.isError || profile.data === undefined) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-5">
        <p className="text-sm text-rose-800">Dieses Steuerprofil wurde nicht gefunden.</p>
        <Link
          to="/settings/tax-profiles"
          className="mt-3 inline-block text-sm font-medium underline"
        >
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  const data = profile.data;
  const isArchived = data.archivedAt !== null;
  const usageCount = data.invoiceCount + data.customerCount;
  const saveError = save.error instanceof ApiRequestError ? save.error : null;
  const removeError = remove.error instanceof ApiRequestError ? remove.error : null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/settings/tax-profiles" className="text-sm text-slate-500 hover:underline">
          ← Steuerprofile
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{data.name}</h1>
          {data.isDefault && !isArchived && (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
              Standard
            </span>
          )}
          {isArchived && (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              archiviert
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {usageCount === 0
            ? 'Wird bisher nicht verwendet.'
            : 'Änderungen wirken sich nicht auf bereits ausgestellte Rechnungen aus — dort steht der eingefrorene Steuerhinweis.'}
        </p>
      </div>

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
        <h2 className="text-base font-semibold text-slate-900">Profil verwalten</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Archivierte Profile bleiben erhalten, damit bestehende Entwürfe und Kundenvorgaben ihre
          Zuordnung behalten.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => archive.mutate(!isArchived)}
            disabled={archive.isPending}
          >
            {isArchived ? 'Wieder aktivieren' : 'Archivieren'}
          </Button>

          {usageCount === 0 ? (
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`„${data.name}" endgültig löschen?`)) remove.mutate();
              }}
            >
              Endgültig löschen
            </Button>
          ) : (
            <span className="text-sm text-slate-500">
              Endgültiges Löschen ist nicht möglich, solange Rechnungen oder Kunden dieses Profil
              verwenden.
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
