// Розділи застосунку всередині макета. Кожна відкрита вкладка рендерить їх сама (useRoutes зі своєю адресою),
// тому неактивні вкладки лишаються змонтованими й не втрачають стан.
// Розділи вантажаться при першому відкритті: стартовий файл застосунку менший, а розділ, який не відкривали, не вантажиться зовсім.
import { Spin } from 'antd';
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import NotFoundPage from '@/pages/NotFoundPage';
import { RequireAdmin } from './RequireUser';

const CatalogPage = lazy(() => import('@/pages/catalog/CatalogPage'));
const ClientsPage = lazy(() => import('@/pages/clients/ClientsPage'));
const RequestEditorPage = lazy(() => import('@/pages/request-editor/RequestEditorPage'));
const RegistryPage = lazy(() => import('@/pages/requests/RegistryPage'));
const RatesPage = lazy(() => import('@/pages/settings/RatesPage'));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));
const SuppliersPage = lazy(() => import('@/pages/suppliers/SuppliersPage'));

function page(Page: ComponentType, wrap: (el: ReactNode) => ReactNode = (el) => el): ReactNode {
  return <Suspense fallback={<Spin style={{ display: 'block', margin: '48px auto' }} />}>{wrap(<Page />)}</Suspense>;
}

export const APP_ROUTES: RouteObject[] = [
  { index: true, element: <Navigate to="/requests" replace /> },
  { path: 'requests', element: page(RegistryPage) },
  { path: 'requests/:id/:tab?', element: page(RequestEditorPage) },
  { path: 'catalog', element: page(CatalogPage) },
  { path: 'suppliers', element: page(SuppliersPage) },
  { path: 'clients', element: page(ClientsPage) },
  { path: 'rates', element: page(RatesPage) },
  { path: 'settings', element: page(SettingsPage, (el) => <RequireAdmin>{el}</RequireAdmin>) },
  { path: '*', element: <NotFoundPage /> },
];
