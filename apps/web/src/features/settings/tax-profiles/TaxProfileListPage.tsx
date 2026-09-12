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
import { Badge } from '../../../components/ui/Badge.js';
import { buttonClassName } from '../../../components/ui/Button.js';
import { Checkbox } from '../../../components/ui/Checkbox.js';
import { EmptyState } from '../../../components/ui/EmptyState.js';
import { PageHeader } from '../../../components/ui/PageHeader.js';
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
      <PageHeader
        title="Steuerprofile"
        description="Wiederkehrende steuerliche Konstellationen. Das gewählte Profil setzt den Vorschlag für neue Positionen; jede Position behält ihren eigenen Satz, damit gemischte Rechnungen möglich bleiben."
        actions={
          <Link to="/settings/tax-profiles/new" className={buttonClassName()}>
            Neues Profil
          </Link>
        }
      />

      <Checkbox
        id="includeArchived"
        label="Archivierte anzeigen"
        checked={includeArchived}
        onChange={(event) => setIncludeArchived(event.target.checked)}
      />

      {profiles.isSuccess && !hasDefault && profiles.data.length > 0 && (
        <div className="rounded-lg border border-attention-border bg-attention-surface p-4">
          <p className="text-sm text-attention-ink">
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
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-border bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Profil</th>
                <th className="px-4 py-2 font-medium">Steuerart</th>
                <th className="px-4 py-2 font-medium">Satz</th>
                <th className="px-4 py-2 font-medium">Verwendung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {profiles.data.map((profile) => (
                <tr key={profile.id} className="hover:bg-surface-sunken">
                  <td className="px-4 py-3">
                    <Link
                      to={`/settings/tax-profiles/${profile.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {profile.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {profile.isDefault && profile.archivedAt === null && (
                        <Badge tone="success">Standard</Badge>
                      )}
                      {profile.archivedAt !== null && <Badge>archiviert</Badge>}
                    </div>
                    {profile.noteText !== null && (
                      <p className="mt-1 max-w-md text-xs text-ink-subtle">{profile.noteText}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {TAX_PROFILE_KIND_LABELS[profile.kind]}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {allowsRateInput(profile.kind)
                      ? formatBasisPoints(profile.defaultRateBasisPoints)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-subtle">
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
