import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { CompanyPage } from '../features/settings/company/CompanyPage';
import { CustomerListPage } from '../features/customers/CustomerListPage';
import { EditCustomerPage } from '../features/customers/EditCustomerPage';
import { NewCustomerPage } from '../features/customers/NewCustomerPage';
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
      { path: 'settings/company', element: <CompanyPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
