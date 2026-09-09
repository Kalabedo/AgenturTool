import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { CustomerPayload, CustomerResponse } from '@agentur-tool/shared';
import { apiClient } from '../../lib/apiClient.js';
import { fieldErrorsOf, formErrorOf } from '../../lib/errorMessage.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { CustomerForm, emptyCustomerValues } from './CustomerForm.js';

export function NewCustomerPage(): JSX.Element {
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
      <div>
        <Link to="/customers" className="text-sm text-slate-500 hover:underline">
          ← Kunden
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Neuer Kunde</h1>
      </div>

      <CustomerForm
        defaultValues={emptyCustomerValues()}
        submitLabel="Kunde anlegen"
        isSubmitting={create.isPending}
        onSubmit={(payload) => create.mutate(payload)}
        fieldErrors={fieldErrorsOf(create.error)}
        generalError={formErrorOf(create.error)}
        secondaryActions={
          <Link to="/customers" className="text-sm text-slate-600 hover:underline">
            Abbrechen
          </Link>
        }
      />
    </div>
  );
}
