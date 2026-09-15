/**
 * TSV з буфера обміну (формат Excel/Google Sheets): рядки через \n або \r\n, клітинки через \t;
 * клітинка, що починається з '"', — у лапках (може містити \t, \n, '""' → '"').
 * Завершальний порожній рядок відкидається.
 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  const n = text.length;
  let cellStart = true;

  const endCell = () => {
    row.push(cell);
    cell = '';
    cellStart = true;
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];
    if (cellStart && ch === '"') {
      // клітинка в лапках
      const close = findClosingQuote(text, i + 1);
      if (close >= 0) {
        cell = text.slice(i + 1, close).replace(/""/g, '"');
        i = close + 1;
        cellStart = false;
        continue;
      }
    }
    cellStart = false;
    if (ch === '\t') {
      endCell();
      i++;
    } else if (ch === '\r' && text[i + 1] === '\n') {
      endRow();
      i += 2;
    } else if (ch === '\n' || ch === '\r') {
      endRow();
      i++;
    } else {
      cell += ch;
      i++;
    }
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

/** Закривна лапка, за якою йде кінець клітинки/рядка/тексту; -1 — лапки не закрито коректно. */
function findClosingQuote(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    if (text[i] === '"') {
      if (text[i + 1] === '"') {
        i += 2;
        continue;
      }
      const next = text[i + 1];
      if (next === undefined || next === '\t' || next === '\n' || next === '\r') return i;
      return -1;
    }
    i++;
  }
  return -1;
}
