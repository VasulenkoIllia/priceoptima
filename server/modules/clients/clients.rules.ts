// Правила вкладених списків клієнта, які не залежать від бази:
// головний контакт — по одному на контрагента (основний контрагент — спільне правило, lib/defaults).

/**
 * Головний контакт — по одному на контрагента (контакти без контрагента рахуються окремою групою):
 * у КП і листах підставляється саме він.
 */
export function withSingleDefaultPerCounterparty<T extends { counterpartyId: string | null; isDefault: boolean }>(
  contacts: readonly T[],
): T[] {
  const chosen = new Map<string, number>();
  contacts.forEach((contact, i) => {
    const key = contact.counterpartyId ?? '';
    if (contact.isDefault && !chosen.has(key)) chosen.set(key, i);
  });
  contacts.forEach((contact, i) => {
    const key = contact.counterpartyId ?? '';
    if (!chosen.has(key)) chosen.set(key, i);
  });
  return contacts.map((contact, i) => ({ ...contact, isDefault: chosen.get(contact.counterpartyId ?? '') === i }));
}
