// Порівняння за вмістом без огляду на порядок ключів: Postgres (jsonb) зберігає ключі JSON у власному порядку.

/** JSON з відсортованими ключами (undefined, як і в JSON.stringify, пропускається). */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  });
}
