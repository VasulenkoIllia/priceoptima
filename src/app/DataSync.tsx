import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ds, qk } from '@/data';

/** Зміни з інших вкладок: дані — перечитати, блокування — оновити реєстр, скидання демо-даних — перезавантажити. */
export function DataSync() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      ds.subscribe((e) => {
        if (e.kind === 'reset') {
          window.location.assign('/requests');
        } else if (e.kind === 'db') {
          void queryClient.invalidateQueries();
        } else {
          void queryClient.invalidateQueries({ queryKey: qk.requestsAll });
        }
      }),
    [queryClient],
  );
  return null;
}
