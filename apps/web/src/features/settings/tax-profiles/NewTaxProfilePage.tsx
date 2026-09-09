import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { TaxProfilePayload, TaxProfileResponse } from '@agentur-tool/shared';
import { apiClient } from '../../../lib/apiClient.js';
import { fieldErrorsOf, formErrorOf } from '../../../lib/errorMessage.js';
import { queryKeys } from '../../../lib/queryKeys.js';
import { TaxProfileForm, emptyTaxProfileValues } from './TaxProfileForm.js';
import { useDocumentTitle } from '../../../lib/useDocumentTitle.js';

export function NewTaxProfilePage(): JSX.Element {
  useDocumentTitle('Neues Steuerprofil');
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
        fieldErrors={fieldErrorsOf(create.error)}
        generalError={formErrorOf(create.error)}
        secondaryActions={
          <Link to="/settings/tax-profiles" className="text-sm text-slate-600 hover:underline">
            Abbrechen
          </Link>
        }
      />
    </div>
  );
}
