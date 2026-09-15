import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { CustomerPayload, CustomerResponse } from '@privatura/shared';
import { apiClient } from '../../lib/apiClient.js';
import { fieldErrorsOf, formErrorOf } from '../../lib/errorMessage.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { CustomerForm, emptyCustomerValues } from './CustomerForm.js';
import { buttonClassName } from '../../components/ui/Button.js';
import { PageHeader } from '../../components/ui/PageHeader.js';
import { useDocumentTitle } from '../../lib/useDocumentTitle.js';

export function NewCustomerPage(): JSX.Element {
  useDocumentTitle('Neuer Kunde');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (payload: CustomerPayload) =>
      apiClient.post<CustomerResponse>('/customers', payload),
    onSuccess: async (customer) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      navigate(`/customers/${customer.id}`, { replace: true });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader back={{ to: '/customers', label: 'Kunden' }} title="Neuer Kunde" />

      <CustomerForm
        defaultValues={emptyCustomerValues()}
        submitLabel="Kunde anlegen"
        isSubmitting={create.isPending}
        onSubmit={(payload) => create.mutate(payload)}
        fieldErrors={fieldErrorsOf(create.error)}
        generalError={formErrorOf(create.error)}
        secondaryActions={
          // Abbrechen ist eine Handlung und sieht deshalb aus wie eine —
          // vorher war es ein Textlink neben einem Knopf, zwei Bauteile für
          // zwei gleichrangige Auswege aus demselben Formular.
          <Link to="/customers" className={buttonClassName('secondary')}>
            Abbrechen
          </Link>
        }
      />
    </div>
  );
}
