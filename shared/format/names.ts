// Коротке ім'я з ПІБ: «Коваль Олена Василівна» → «Коваль О.В.» (у реєстрі, історії, КП).

export function shortNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/u).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  const [surname, ...rest] = parts;
  // ім'я й по батькові; решта (подвійні імена тощо) в ініціали не йде
  return `${surname} ${rest
    .slice(0, 2)
    .map((p) => `${p[0].toLocaleUpperCase('uk')}.`)
    .join('')}`;
}
