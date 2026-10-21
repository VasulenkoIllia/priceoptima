// Аркуш «Довідника» в роботі: правки одразу в таблиці, на сервер — цілим аркушем після паузи в наборі.
// Збереження йде з версією, яку бачив користувач: якщо аркуш тим часом змінив колега, сервер відмовить (VERSION_CONFLICT),
// і ми завантажимо його версію, а не затремо її. Нова версія з сервера без наших незбережених правок приймається сама.
// Повторюємо лише короткі збої мережі чи сервера; відмову сервера (помилка в даних, аркуш видалено) показуємо й чекаємо.
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { REFERENCE_MAX_SHEET_CHARS, sheetTextLength } from '@shared/reference/limits';
import type { ReferenceSheetDto, ReferenceSheetMeta } from '@shared/types';
import { ds, errorMessage, isDataSourceError, isTransientError, qk } from '@/data';
import type { SaveState } from '@/stores/requestDocStore';
import { contentOf, type SheetContent } from './sheet';

const RETRY_MAX_MS = 30_000;

export interface SheetDraft {
  content: SheetContent;
  /** false — зміну не прийнято: аркуш перевищив би межу тексту. */
  update: (change: (sheet: SheetContent) => SheetContent) => boolean;
  /** Зберегти зараз, не чекаючи паузи (перейменування). */
  flush: () => void;
  /** «Повторити» після помилки: зберегти знову або, після чужих правок, завантажити актуальну версію. */
  retry: () => void;
  saveState: SaveState;
  savedAt: string | null;
  error: string | null;
  dirty: boolean;
}

interface Live {
  content: SheetContent;
  version: number;
  dirty: boolean;
  saving: boolean;
  /** Сервер відмовив через чужі правки: свої не надсилаємо, доки не завантажимо актуальну версію. */
  conflict: boolean;
  /** Редактор закрито: більше нічого не плануємо. */
  closed: boolean;
  failures: number;
  timer: number;
}

/** Збережений чи завантажений аркуш — у кеш аркуша й у список вкладок (назва, версія, хто змінив). */
function storeSheet(queryClient: QueryClient, sheet: ReferenceSheetDto): void {
  queryClient.setQueryData(qk.referenceSheet(sheet.id), sheet);
  const { columns: _columns, rows: _rows, ...meta } = sheet;
  queryClient.setQueryData<ReferenceSheetMeta[]>(qk.referenceSheets, (list) => list?.map((x) => (x.id === sheet.id ? meta : x)));
}

export function useSheetDraft(sheet: ReferenceSheetDto, debounceMs: number, onConflict: () => void): SheetDraft {
  const queryClient = useQueryClient();
  const [content, setContent] = useState(() => contentOf(sheet));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const live = useRef<Live>({ content, version: sheet.version, dirty: false, saving: false, conflict: false, closed: false, failures: 0, timer: 0 });
  const props = useRef({ debounceMs, onConflict });
  props.current = { debounceMs, onConflict };

  const adopt = useCallback((fresh: ReferenceSheetDto) => {
    const s = live.current;
    window.clearTimeout(s.timer);
    Object.assign(s, { version: fresh.version, content: contentOf(fresh), dirty: false, conflict: false, failures: 0 });
    setContent(s.content);
    setDirty(false);
    setSaveState('idle');
    setError(null);
  }, []);

  const fail = useCallback((message: string) => {
    setSaveState('error');
    setError(message);
  }, []);

  /** Після VERSION_CONFLICT: актуальна версія колеги замість наших незбережених правок. */
  const reload = useCallback(() => {
    ds.getReferenceSheet(sheet.id)
      .then((fresh) => {
        storeSheet(queryClient, fresh);
        if (!live.current.closed) adopt(fresh);
      })
      .catch((e: unknown) => fail(`Не вдалося завантажити актуальну версію аркуша: ${errorMessage(e)}`));
  }, [sheet.id, queryClient, adopt, fail]);

  const send = useCallback(() => {
    const s = live.current;
    window.clearTimeout(s.timer);
    if (s.saving || !s.dirty || s.conflict) return;
    const sent = s.content;
    s.saving = true;
    s.dirty = false;
    setSaveState('saving');
    ds.saveReferenceSheet(sheet.id, { version: s.version, ...sent })
      .then((saved) => {
        s.version = saved.version;
        s.failures = 0;
        storeSheet(queryClient, saved);
        setSaveState('saved');
        setSavedAt(new Date().toISOString());
        setError(null);
      })
      .catch((e: unknown) => {
        if (isDataSourceError(e, 'VERSION_CONFLICT')) {
          s.conflict = true;
          if (s.closed) return;
          props.current.onConflict();
          reload();
          return;
        }
        s.dirty = true;
        s.failures += 1;
        fail(errorMessage(e));
        if (isDataSourceError(e, 'NOT_FOUND')) void queryClient.invalidateQueries({ queryKey: qk.referenceSheets, exact: true });
        // постійна відмова сервера: не повторюємо, доки користувач не змінить аркуш чи не натисне «Повторити»
        if (!isTransientError(e)) s.failures = Number.POSITIVE_INFINITY;
      })
      .finally(() => {
        s.saving = false;
        setDirty(s.dirty);
        if (!s.dirty || s.conflict || s.closed || !Number.isFinite(s.failures)) return;
        const delay = s.failures ? Math.min(RETRY_MAX_MS, props.current.debounceMs * 2 ** s.failures) : props.current.debounceMs;
        s.timer = window.setTimeout(send, delay);
      });
  }, [sheet.id, queryClient, reload, fail]);

  const update = useCallback(
    (change: (current: SheetContent) => SheetContent) => {
      const s = live.current;
      const next = change(s.content);
      if (next === s.content) return true;
      if (sheetTextLength(next) > REFERENCE_MAX_SHEET_CHARS) return false;
      Object.assign(s, { content: next, dirty: true, failures: 0 });
      setContent(next);
      setDirty(true);
      window.clearTimeout(s.timer);
      s.timer = window.setTimeout(send, props.current.debounceMs);
      return true;
    },
    [send],
  );

  const retry = useCallback(() => {
    live.current.failures = 0;
    if (live.current.conflict) reload();
    else send();
  }, [reload, send]);

  // колега зберіг нову версію (перечитали аркуш): приймаємо, якщо своїх незбережених правок немає
  useEffect(() => {
    const s = live.current;
    if (sheet.version > s.version && !s.dirty && !s.saving && !s.conflict) adopt(sheet);
  }, [sheet, adopt]);

  // аркуш закривають (інший аркуш, інший розділ): незбережене — одним запитом без повторів; закриття вкладки браузера перепитає
  useEffect(() => {
    const s = live.current;
    s.closed = false;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (s.dirty || s.saving) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      s.closed = true;
      if (s.dirty && !s.conflict) {
        // повернулись до аркуша раніше, ніж прийшла відповідь, — показати свій текст, а не старий
        queryClient.setQueryData<ReferenceSheetDto>(qk.referenceSheet(sheet.id), (old) => (old ? { ...old, ...s.content } : old));
      }
      send();
    };
  }, [send, sheet.id, queryClient]);

  return { content, update, flush: send, retry, saveState, savedAt, error, dirty };
}
