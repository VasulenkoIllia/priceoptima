import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import ukUA from 'antd/locale/uk_UA';
import dayjs from 'dayjs';
import 'dayjs/locale/uk';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router/dom';
import { router } from '@/app/router';
import { isDataSourceError, qk } from '@/data';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import { antdTheme, applyThemeCssVars } from '@/theme';

dayjs.locale('uk');

const queryClient: QueryClient = new QueryClient({
  // вхід спільний для вкладок: після виходу в іншій вкладці перша ж відмова UNAUTHORIZED веде на «Вхід»
  queryCache: new QueryCache({
    onError: (error) => {
      if (isDataSourceError(error, 'UNAUTHORIZED')) queryClient.setQueryData(qk.me, null);
    },
  }),
  defaultOptions: {
    queries: {
      // помилки API (NOT_FOUND, UNAUTHORIZED…) не повторюємо; повернувшись у вкладку — перечитуємо (дані змінюють інші користувачі)
      retry: (count, error) => !isDataSourceError(error) && count < 1,
    },
  },
});

export default function App() {
  const density = useUiPrefs((s) => s.density);
  useEffect(() => applyThemeCssVars(density), [density]);
  return (
    <ConfigProvider locale={ukUA} theme={antdTheme(density)}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
