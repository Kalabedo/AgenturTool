import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { TaxProfilePayload, TaxProfileResponse } from '@privatura/shared';
import { apiClient } from '../../../lib/apiClient.js';
import { fieldErrorsOf, formErrorOf } from '../../../lib/errorMessage.js';
import { queryKeys } from '../../../lib/queryKeys.js';
import { TaxProfileForm, emptyTaxProfileValues } from './TaxProfileForm.js';
import { buttonClassName } from '../../../components/ui/Button.js';
import { PageHeader } from '../../../components/ui/PageHeader.js';
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
      <PageHeader
        back={{ to: '/settings/tax-profiles', label: 'Steuerprofile' }}
        title="Neues Steuerprofil"
      />

      <TaxProfileForm
        defaultValues={emptyTaxProfileValues()}
        submitLabel="Profil anlegen"
        isSubmitting={create.isPending}
        onSubmit={(payload) => create.mutate(payload)}
        fieldErrors={fieldErrorsOf(create.error)}
        generalError={formErrorOf(create.error)}
        secondaryActions={
          // Abbrechen ist eine Handlung und sieht deshalb aus wie eine —
          // vorher war es ein Textlink neben einem Knopf, zwei Bauteile für
          // zwei gleichrangige Auswege aus demselben Formular.
          <Link to="/settings/tax-profiles" className={buttonClassName('secondary')}>
            Abbrechen
          </Link>
        }
      />
    </div>
  );
}
