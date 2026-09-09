import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { SettingsLayout } from '../features/settings/SettingsLayout';
import { NotFoundPage } from './NotFoundPage';
import { RouteErrorPage } from './RouteErrorPage';

// Die Seiten werden erst bei ihrer ersten Navigation geladen. Besonders der
// Rechnungseditor bringt das vollständige Druck-Template mit; ohne diese
// Trennung müsste selbst die Anmeldeseite den größten Teil der Anwendung
// herunterladen.
const dashboardPage = async () => ({
  Component: (await import('../features/dashboard/DashboardPage')).DashboardPage,
});
const invoiceListPage = async () => ({
  Component: (await import('../features/invoices/InvoiceListPage')).InvoiceListPage,
});
const invoiceEditorPage = async () => ({
  Component: (await import('../features/invoices/InvoiceEditorPage')).InvoiceEditorPage,
});
const timeTrackingPage = async () => ({
  Component: (await import('../features/time-tracking/TimeTrackingPage')).TimeTrackingPage,
});
const customerListPage = async () => ({
  Component: (await import('../features/customers/CustomerListPage')).CustomerListPage,
});
const newCustomerPage = async () => ({
  Component: (await import('../features/customers/NewCustomerPage')).NewCustomerPage,
});
const editCustomerPage = async () => ({
  Component: (await import('../features/customers/EditCustomerPage')).EditCustomerPage,
});
const companyPage = async () => ({
  Component: (await import('../features/settings/company/CompanyPage')).CompanyPage,
});
const taxProfileListPage = async () => ({
  Component: (await import('../features/settings/tax-profiles/TaxProfileListPage'))
    .TaxProfileListPage,
});
const newTaxProfilePage = async () => ({
  Component: (await import('../features/settings/tax-profiles/NewTaxProfilePage'))
    .NewTaxProfilePage,
});
const editTaxProfilePage = async () => ({
  Component: (await import('../features/settings/tax-profiles/EditTaxProfilePage'))
    .EditTaxProfilePage,
});
const backupPage = async () => ({
  Component: (await import('../features/settings/backup/BackupPage')).BackupPage,
});

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    // Die Fehlerseite hängt am Layout, nicht an jeder Route: So bleiben
    // Kopfzeile und Navigation stehen, und der Weg zurück ist ein Klick.
    errorElement: <AppLayout error={<RouteErrorPage />} />,
    children: [
      { index: true, lazy: dashboardPage },
      { path: 'invoices', lazy: invoiceListPage },
      { path: 'invoices/:id', lazy: invoiceEditorPage },
      { path: 'time-tracking', lazy: timeTrackingPage },
      { path: 'customers', lazy: customerListPage },
      { path: 'customers/new', lazy: newCustomerPage },
      { path: 'customers/:id', lazy: editCustomerPage },
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, lazy: companyPage },
          { path: 'company', lazy: companyPage },
          { path: 'tax-profiles', lazy: taxProfileListPage },
          { path: 'tax-profiles/new', lazy: newTaxProfilePage },
          { path: 'tax-profiles/:id', lazy: editTaxProfilePage },
          { path: 'backup', lazy: backupPage },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
