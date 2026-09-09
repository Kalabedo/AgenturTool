import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { CompanyPage } from '../features/settings/company/CompanyPage';
import { CustomerListPage } from '../features/customers/CustomerListPage';
import { EditCustomerPage } from '../features/customers/EditCustomerPage';
import { NewCustomerPage } from '../features/customers/NewCustomerPage';
import { InvoiceEditorPage } from '../features/invoices/InvoiceEditorPage';
import { InvoiceListPage } from '../features/invoices/InvoiceListPage';
import { TimeTrackingPage } from '../features/time-tracking/TimeTrackingPage';
import { SettingsLayout } from '../features/settings/SettingsLayout';
import { BackupPage } from '../features/settings/backup/BackupPage';
import { EditTaxProfilePage } from '../features/settings/tax-profiles/EditTaxProfilePage';
import { NewTaxProfilePage } from '../features/settings/tax-profiles/NewTaxProfilePage';
import { TaxProfileListPage } from '../features/settings/tax-profiles/TaxProfileListPage';
import { NotFoundPage } from './NotFoundPage';
import { RouteErrorPage } from './RouteErrorPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    // Die Fehlerseite hängt am Layout, nicht an jeder Route: So bleiben
    // Kopfzeile und Navigation stehen, und der Weg zurück ist ein Klick.
    errorElement: <AppLayout error={<RouteErrorPage />} />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'invoices', element: <InvoiceListPage /> },
      { path: 'invoices/:id', element: <InvoiceEditorPage /> },
      { path: 'time-tracking', element: <TimeTrackingPage /> },
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
          { path: 'backup', element: <BackupPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
