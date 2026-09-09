import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  TAX_PROFILE_KIND_LABELS,
  allowsRateInput,
  formatBasisPoints,
  type TaxProfileResponse,
} from '@agentur-tool/shared';
import { apiClient } from '../../../lib/apiClient.js';
import { queryKeys } from '../../../lib/queryKeys.js';
import { buttonClassName } from '../../../components/ui/Button.js';
import { EmptyState } from '../../../components/ui/EmptyState.js';
import { ErrorNotice } from '../../../components/ui/ErrorNotice.js';
import { LoadingNote } from '../../../components/ui/LoadingNote.js';
import { useDocumentTitle } from '../../../lib/useDocumentTitle.js';

export function TaxProfileListPage(): JSX.Element {
  useDocumentTitle('Steuerprofile');
  const [includeArchived, setIncludeArchived] = useState(false);

  const profiles = useQuery({
    queryKey: queryKeys.taxProfiles.list(includeArchived),
    queryFn: () =>
      apiClient.get<TaxProfileResponse[]>(`/tax-profiles?includeArchived=${includeArchived}`),
  });

  const hasDefault = profiles.data?.some((p) => p.isDefault && p.archivedAt === null) ?? true;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Steuerprofile</h1>
          <p className="mt-1 text-sm text-slate-500">
            Wiederkehrende steuerliche Konstellationen. Das gewählte Profil setzt den Vorschlag für
            neue Positionen; jede Position behält ihren eigenen Satz, damit gemischte Rechnungen
            möglich bleiben.
          </p>
        </div>
        <Link to="/settings/tax-profiles/new" className={buttonClassName()}>
          Neues Profil
        </Link>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(event) => setIncludeArchived(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-200"
        />
        Archivierte anzeigen
      </label>

      {profiles.isSuccess && !hasDefault && profiles.data.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            Kein Profil ist als Standard markiert. Neue Rechnungen haben dann keinen Vorschlag.
          </p>
        </div>
      )}

      {profiles.isLoading && <LoadingNote>Steuerprofile werden geladen …</LoadingNote>}

      {profiles.isError && (
        <ErrorNotice
          error={profiles.error}
          title="Die Steuerprofile konnten nicht geladen werden."
          onRetry={() => void profiles.refetch()}
        />
      )}

      {profiles.isSuccess && profiles.data.length === 0 && (
        <EmptyState
          title="Keine Steuerprofile"
          description="Ohne Profil lässt sich später keine Rechnung erstellen."
          action={
            <Link to="/settings/tax-profiles/new" className={buttonClassName()}>
              Neues Profil
            </Link>
          }
        />
      )}

      {profiles.isSuccess && profiles.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Profil</th>
                <th className="px-4 py-2 font-medium">Steuerart</th>
                <th className="px-4 py-2 font-medium">Satz</th>
                <th className="px-4 py-2 font-medium">Verwendung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profiles.data.map((profile) => (
                <tr key={profile.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/settings/tax-profiles/${profile.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {profile.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {profile.isDefault && profile.archivedAt === null && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">
                          Standard
                        </span>
                      )}
                      {profile.archivedAt !== null && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                          archiviert
                        </span>
                      )}
                    </div>
                    {profile.noteText !== null && (
                      <p className="mt-1 max-w-md text-xs text-slate-500">{profile.noteText}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {TAX_PROFILE_KIND_LABELS[profile.kind]}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {allowsRateInput(profile.kind)
                      ? formatBasisPoints(profile.defaultRateBasisPoints)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {profile.invoiceCount === 0 && profile.customerCount === 0
                      ? '—'
                      : [
                          profile.invoiceCount > 0 ? `${profile.invoiceCount} Rechn.` : null,
                          profile.customerCount > 0 ? `${profile.customerCount} Kunden` : null,
                        ]
                          .filter((part) => part !== null)
                          .join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
