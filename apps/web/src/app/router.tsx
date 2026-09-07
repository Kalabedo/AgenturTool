import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { CompanyPage } from '../features/settings/company/CompanyPage';
import { NotFoundPage } from './NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'settings/company', element: <CompanyPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
