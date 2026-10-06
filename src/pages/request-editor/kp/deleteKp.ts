// Видалення версії КП (правки замовника 01.10 п.3) — з вкладок «Файли» і «КП».
import type { QueryClient } from '@tanstack/react-query';
import type { KpDocumentDto, UUID } from '@shared/types';
import { ds, qk } from '@/data';
import { getRequestDocStore } from '@/stores/requestDocStore';

export const kpDeleteTitle = (kp: KpDocumentDto) => `Видалити КП № ${kp.numberLabel}${kp.onlyApproved ? ' (фінальне)' : ''}, версія ${kp.version}?`;
export const KP_DELETE_HINT = 'PDF і Excel цієї версії більше не можна буде завантажити';

/**
 * Незбережені зміни — спершу на сервер: КП-основу погодження сервер перевіряє за збереженою заявкою.
 * Далі оновлюються версії КП, історія й реєстр (кількість КП, остання КП). Помилка оновлення списків — не помилка видалення.
 */
export async function deleteKpVersion(queryClient: QueryClient, requestId: UUID, kp: KpDocumentDto): Promise<void> {
  await getRequestDocStore().getState().flush();
  await ds.deleteKp(requestId, kp.id);
  // список версій — дочекатися: інакше видалена ще видно, і її можна вибрати чи «видалити» вдруге
  queryClient.setQueryData<KpDocumentDto[]>(qk.kps(requestId), (list) => list?.filter((k) => k.id !== kp.id));
  await Promise.all([qk.kps(requestId), qk.history(requestId), qk.requestsAll].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
