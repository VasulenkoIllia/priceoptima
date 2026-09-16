// Позначка «основний» у вкладених списках довідників (юрособи постачальника, контрагенти клієнта).

/** Рівно одна позначка «основний»: перша позначена, а якщо жодної — перший у списку. */
export function withSingleDefault<T extends { isDefault: boolean }>(items: readonly T[]): T[] {
  const chosen = items.findIndex((x) => x.isDefault);
  const index = chosen >= 0 ? chosen : 0;
  return items.map((item, i) => ({ ...item, isDefault: i === index }));
}
