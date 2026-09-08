import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { CompanyPage } from '../features/settings/company/CompanyPage';
import { CustomerListPage } from '../features/customers/CustomerListPage';
import { EditCustomerPage } from '../features/customers/EditCustomerPage';
import { NewCustomerPage } from '../features/customers/NewCustomerPage';
import { SettingsLayout } from '../features/settings/SettingsLayout';
import { EditTaxProfilePage } from '../features/settings/tax-profiles/EditTaxProfilePage';
import { NewTaxProfilePage } from '../features/settings/tax-profiles/NewTaxProfilePage';
import { TaxProfileListPage } from '../features/settings/tax-profiles/TaxProfileListPage';
import { NotFoundPage } from './NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'customers', element: <CustomerListPage /> },
      { path: 'customers/new', element: <NewCustomerPage /> },
      { path: 'customers/:id', element: <EditCustomerPage /> },
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <CompanyPage /> },
          { path: 'company', element: <CompanyPage /> },
          { path: 'tax-profiles', element: <TaxProfileListPage /> },
          { path: 'tax-profiles/new', element: <NewTaxProfilePage /> },
          { path: 'tax-profiles/:id', element: <EditTaxProfilePage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
