import { Button, Result } from 'antd';
import { createBrowserRouter, useRouteError } from 'react-router';
import { InvitePage, ResetPasswordPage } from '@/pages/login/AccessLinkPage';
import LoginPage from '@/pages/login/LoginPage';
import { AppLayout } from './AppLayout';
import { APP_ROUTES } from './appRoutes';
import { RequireUser } from './RequireUser';

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
 * Маршрути: /login · /invite/:token · /reset/:token · /requests (реєстр) · /requests/:id/:tab? (редактор; tab = sourcing | markup | kp | approval | files | history)
 * · /catalog · /suppliers · /clients · /rates · /settings (адміністратор).
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  // разові посилання — без входу
  { path: '/invite/:token', element: <InvitePage />, errorElement: <RouteError /> },
  { path: '/reset/:token', element: <ResetPasswordPage />, errorElement: <RouteError /> },
  {
    path: '/',
    element: (
      <RequireUser>
        <AppLayout />
      </RequireUser>
    ),
    errorElement: <RouteError />,
    // розділи рендерить AppLayout — кожна вкладка окремо (AppTabs)
    children: APP_ROUTES,
  },
]);
