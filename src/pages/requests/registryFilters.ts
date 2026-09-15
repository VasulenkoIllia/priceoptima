// Фільтри реєстру заявок — у пам'яті вкладки: переживають перехід у заявку й назад, скидаються з перезавантаженням сторінки.
import { create } from 'zustand';
import type { RequestStatus } from '@shared/enums';
import type { ISODate, UUID } from '@shared/types';

export type StatusFilter = RequestStatus | 'all';

export interface RegistryFilters {
  search: string;
  status: StatusFilter;
  clientId: UUID | null;
  managerId: UUID | null;
  dateFrom: ISODate | null;
  dateTo: ISODate | null;
}

const EMPTY_FILTERS: RegistryFilters = {
  search: '',
  status: 'all',
  clientId: null,
  managerId: null,
  dateFrom: null,
  dateTo: null,
};

interface RegistryFiltersState extends RegistryFilters {
  setFilters(patch: Partial<RegistryFilters>): void;
  resetFilters(): void;
}

export const useRegistryFilters = create<RegistryFiltersState>()((set) => ({
  ...EMPTY_FILTERS,
  setFilters: (patch) => set(patch),
  resetFilters: () => set(EMPTY_FILTERS),
}));

/** Чи задано хоч один фільтр (тоді показуємо «Скинути»). */
export function hasFilters(f: RegistryFilters): boolean {
  return f.search.trim() !== '' || f.status !== 'all' || !!f.clientId || !!f.managerId || !!f.dateFrom || !!f.dateTo;
}
