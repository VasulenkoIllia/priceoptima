// Попередній перегляд КП за поточними цінами заявки — той самий знімок, що сформує сервер, лише без номера.
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toIsoDate } from '@shared/format';
import { buildKpRows, buildKpSnapshot, kpBuyerOf, kpChecks, kpManagerName, type KpChecks } from '@shared/pricing';
import type { KpSnapshot } from '@shared/types';
import { ds, qk } from '@/data';
import { useRequestComputed, useRequestDoc } from '@/stores/requestDocStore';

export function useKpPreview(): { snapshot: KpSnapshot | null; checks: KpChecks | null } {
  const doc = useRequestDoc((s) => s.doc);
  const ctx = useRequestDoc((s) => s.ctx);
  const computed = useRequestComputed();
  const own = useQuery({ queryKey: qk.ownCompanies, queryFn: () => ds.listOwnCompanies() });
  const users = useQuery({ queryKey: qk.users, queryFn: () => ds.listUsers() });
  const settings = useQuery({ queryKey: qk.settings, queryFn: () => ds.getSettings() });
  // номер КП сталий, тож у перегляді він уже відомий
  const kpNumber = settings.data?.nextKpNumber ?? null;

  return useMemo(() => {
    if (!doc || !ctx || !computed) return { snapshot: null, checks: null };
    const checks = kpChecks(doc.lines, computed);
    const { header, refs } = doc;
    const seller = own.data?.find((c) => c.id === header.ownCompanyId);
    if (!seller) return { snapshot: null, checks };
    const rows = buildKpRows(doc, computed, { ...header.kpSettings, onlyApproved: false }, ctx);
    const snapshot = buildKpSnapshot({
      kpNumber,
      requestNumber: header.number,
      date: toIsoDate(new Date()),
      settings: header.kpSettings,
      vatRatePct: header.vatRatePct,
      rows,
      seller,
      buyer: kpBuyerOf(refs.counterparty, refs.client?.name, refs.contact),
      managerName: kpManagerName(users.data?.find((u) => u.id === header.managerId) ?? refs.manager),
    });
    return { snapshot, checks };
  }, [doc, ctx, computed, own.data, users.data, kpNumber]);
}
