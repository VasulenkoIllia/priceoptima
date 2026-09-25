import { Button, Result, Spin } from 'antd';
import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { MeResponse } from '@shared/types';
import { ds, errorMessage } from '@/data';
import { startUiPrefsSync } from '@/stores/uiPrefsSync';
import { ForcePasswordChange } from './ProfileDialog';
import { SessionProvider, useMeQuery, useSession } from './session';

export function FullScreenSpin() {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spin size="large" />
    </div>
  );
}

/** Сторінки лише для користувача, що «увійшов» у цій вкладці; інакше — на «Вхід». */
export function RequireUser({ children }: { children: ReactNode }) {
  const me = useMeQuery();
  const location = useLocation();
  if (me.isPending) return <FullScreenSpin />;
  if (me.isError) {
    return (
      <Result
        status="error"
        title="Не вдалося завантажити дані"
        subTitle={errorMessage(me.error)}
        extra={<Button onClick={() => void me.refetch()}>Спробувати ще раз</Button>}
      />
    );
  }
  if (!me.data) {
    const from = location.pathname + location.search;
    return <Navigate to={from && from !== '/' ? `/login?from=${encodeURIComponent(from)}` : '/login'} replace />;
  }
  if (me.data.user.mustChangePassword) return <ForcePasswordChange user={me.data.user} />;
  return (
    <SessionProvider value={me.data}>
      <UiPrefsSync me={me.data} />
      {children}
    </SessionProvider>
  );
}

/** Налаштування інтерфейсу користувача (ширина колонок тощо) — з сервера й на сервер. */
function UiPrefsSync({ me }: { me: MeResponse }) {
  const userId = me.user.id;
  // налаштування з сервера беруться раз на користувача (далі джерело — браузер), тож перезапуск лише зі зміною користувача
  useEffect(() => startUiPrefsSync(userId, me.uiPrefs, (prefs, options) => ds.saveUiPrefs(prefs, options)), [userId]);
  return null;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useSession();
  if (user.role !== 'admin') {
    return <Result status="403" title="Лише для адміністратора" subTitle="Цей розділ доступний користувачу з роллю «Адміністратор»." />;
  }
  return <>{children}</>;
}
