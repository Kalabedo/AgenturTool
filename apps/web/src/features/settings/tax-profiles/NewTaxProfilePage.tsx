import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { TaxProfilePayload, TaxProfileResponse } from '@agentur-tool/shared';
import { ApiRequestError, apiClient } from '../../../lib/apiClient.js';
import { queryKeys } from '../../../lib/queryKeys.js';
import { TaxProfileForm, emptyTaxProfileValues } from './TaxProfileForm.js';

export function NewTaxProfilePage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (payload: TaxProfilePayload) =>
      apiClient.post<TaxProfileResponse>('/tax-profiles', payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.taxProfiles.all });
      navigate('/settings/tax-profiles', { replace: true });
    },
  });

  const error = create.error instanceof ApiRequestError ? create.error : null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/settings/tax-profiles" className="text-sm text-slate-500 hover:underline">
          ← Steuerprofile
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Neues Steuerprofil</h1>
      </div>

      <TaxProfileForm
        defaultValues={emptyTaxProfileValues()}
        submitLabel="Profil anlegen"
        isSubmitting={create.isPending}
        onSubmit={(payload) => create.mutate(payload)}
        fieldErrors={error?.fieldErrors()}
        generalError={
          error !== null && Object.keys(error.fieldErrors()).length === 0 ? error.message : null
        }
        secondaryActions={
          <Link to="/settings/tax-profiles" className="text-sm text-slate-600 hover:underline">
            Abbrechen
          </Link>
        }
      />
    </div>
  );
}
