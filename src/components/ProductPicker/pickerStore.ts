// Точка відкриття вікна вибору товару (§6.7). Сітка підбору викликає openPicker(...), вікно читає запит зі стору.
import { create } from 'zustand';
import type { UUID } from '@shared/types';

export interface PickerRequest {
  lineId: UUID;
  /** Клітинка блоку, з якої відкрито (фільтр постачальника); null — «Усі постачальники». */
  blockId: UUID | null;
  supplierId: UUID | null;
  /** Префілл пошуку — «Найменування клієнта» рядка (або артикул). */
  query: string;
  /** 'add' — з рядка/«Обрано» (1–3 товари різних постачальників); 'replace' — замінити товар у клітинці блоку. */
  mode: 'add' | 'replace';
}

interface PickerState {
  request: PickerRequest | null;
  open(request: PickerRequest): void;
  close(): void;
}

export const usePickerStore = create<PickerState>()((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));

/** F4 / Ctrl+Space у сітці, «Замінити товар» у бічній панелі, клік по порожній клітинці порівняння. */
export function openPicker(request: PickerRequest): void {
  usePickerStore.getState().open(request);
}

export function closePicker(): void {
  usePickerStore.getState().close();
}
