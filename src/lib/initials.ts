const LEGAL_FORMS = new Set(['ТОВ', 'ТЗОВ', 'ПП', 'ФОП', 'ПРАТ', 'ПАТ', 'АТ', 'ТДВ', 'КП']);

/** Ініціали для бейджа: «САНТЕХ-ІМПОРТ» → «СІ», «Коваль О.В.» → «КО». Організаційно-правова форма пропускається. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '')
    .replace(/[«»"'“”„()]/gu, ' ')
    .split(/[\s\-–—.]+/u)
    .filter(Boolean);
  const meaningful = words.filter((w) => !LEGAL_FORMS.has(w.toLocaleUpperCase('uk')));
  const src = meaningful.length ? meaningful : words;
  if (src.length === 0) return '?';
  if (src.length === 1) return src[0].slice(0, 2).toLocaleUpperCase('uk');
  return `${src[0][0]}${src[1][0]}`.toLocaleUpperCase('uk');
}
