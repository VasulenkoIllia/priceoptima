import { Button, Result } from 'antd';
import { createBrowserRouter, Navigate, useRouteError } from 'react-router';
import CatalogPage from '@/pages/catalog/CatalogPage';
import ClientsPage from '@/pages/clients/ClientsPage';
import LoginPage from '@/pages/login/LoginPage';
import NotFoundPage from '@/pages/NotFoundPage';
import RequestEditorPage from '@/pages/request-editor/RequestEditorPage';
import RegistryPage from '@/pages/requests/RegistryPage';
import RatesPage from '@/pages/settings/RatesPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import SuppliersPage from '@/pages/suppliers/SuppliersPage';
import { AppLayout } from './AppLayout';
import { RequireAdmin, RequireUser } from './RequireUser';

function RouteError() {
  const error = useRouteError();
  return (
    <Result
      status="error"
      title="Щось пішло не так"
      subTitle={error instanceof Error ? error.message : 'Спробуйте оновити сторінку.'}
      extra={<Button onClick={() => window.location.reload()}>Оновити сторінку</Button>}
    />
  );
}

/**
 * Маршрути: /login · /requests (реєстр) · /requests/:id/:tab? (редактор; tab = sourcing | markup | kp | approval | files | history)
 * · /catalog · /suppliers · /clients · /rates · /settings (адміністратор).
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    path: '/',
    element: (
      <RequireUser>
        <AppLayout />
      </RequireUser>
    ),
    errorElement: <RouteError />,
    children: [
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
    ],
  },
]);
