// Розділи застосунку всередині макета. Кожна відкрита вкладка рендерить їх сама (useRoutes зі своєю адресою),
// тому неактивні вкладки лишаються змонтованими й не втрачають стан.
import { Navigate, type RouteObject } from 'react-router';
import CatalogPage from '@/pages/catalog/CatalogPage';
import ClientsPage from '@/pages/clients/ClientsPage';
import NotFoundPage from '@/pages/NotFoundPage';
import RequestEditorPage from '@/pages/request-editor/RequestEditorPage';
import RegistryPage from '@/pages/requests/RegistryPage';
import RatesPage from '@/pages/settings/RatesPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import SuppliersPage from '@/pages/suppliers/SuppliersPage';
import { RequireAdmin } from './RequireUser';

export const APP_ROUTES: RouteObject[] = [
  { index: true, element: <Navigate to="/requests" replace /> },
  { path: 'requests', element: <RegistryPage /> },
  { path: 'requests/:id/:tab?', element: <RequestEditorPage /> },
  { path: 'catalog', element: <CatalogPage /> },
  { path: 'suppliers', element: <SuppliersPage /> },
  { path: 'clients', element: <ClientsPage /> },
  { path: 'rates', element: <RatesPage /> },
  {
    path: 'settings',
    element: (
      <RequireAdmin>
        <SettingsPage />
      </RequireAdmin>
    ),
  },
  { path: '*', element: <NotFoundPage /> },
];
