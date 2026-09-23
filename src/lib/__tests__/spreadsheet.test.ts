import { describe, expect, it } from 'vitest';
import XLSX from '@e965/xlsx';
import { columnLetter, detectDelimiter, isOle2, isZip, parseCsv, readSpreadsheetFile, SpreadsheetError } from '../spreadsheet';

/** Справжній BIFF-файл (як віддає кабінет постачальника), зібраний у пам'яті. */
function xlsFile(rows: (string | number)[][], name = 'export.xls'): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Worksheet');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xls' }) as ArrayBuffer;
  return new File([bytes], name, { type: 'application/vnd.ms-excel' });
}

const textFile = (text: string, name: string) => new File([new TextEncoder().encode(text)], name);

describe('визначення формату за вмістом', () => {
  const sig = (bytes: number[]) => new Uint8Array(bytes).buffer;

  it('OLE2 і zip розпізнаються за сигнатурою', () => {
    expect(isOle2(sig([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]))).toBe(true);
    expect(isOle2(sig([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
    expect(isZip(sig([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(isZip(sig([0xd0, 0xcf]))).toBe(false);
    expect(isOle2(sig([]))).toBe(false);
    expect(isZip(sig([0x50]))).toBe(false);
  });
});

describe('readSpreadsheetFile', () => {
  it('старий .xls (BIFF) читається', async () => {
    const sheets = await readSpreadsheetFile(
      xlsFile([
        ['Код 1С', 'Назва номенклатури', 'Ціна опт з ПДВ', 'Наявність Україна'],
        ['000007462', 'Труба сталева Ду 15х2,5', 69.02, '100+'],
        ['000017383', 'Труба сталева Ду 15х2,8', 76.18, '30+'],
      ]),
    );
    expect(sheets).toHaveLength(1);
    expect(sheets[0].rows[0]).toEqual(['Код 1С', 'Назва номенклатури', 'Ціна опт з ПДВ', 'Наявність Україна']);
    expect(sheets[0].rows[1]).toEqual(['000007462', 'Труба сталева Ду 15х2,5', '69.02', '100+']);
    expect(sheets[0].rows).toHaveLength(3);
  });

  it('csv під назвою .xls читається як csv — формат беремо з вмісту, не з розширення', async () => {
    const sheets = await readSpreadsheetFile(textFile('Код;Назва;Ціна\n123;Кран;45,5\n', 'price.xls'));
    expect(sheets[0].rows).toEqual([
      ['Код', 'Назва', 'Ціна'],
      ['123', 'Кран', '45,5'],
    ]);
  });

  it('порожній файл — зрозуміла помилка', async () => {
    await expect(readSpreadsheetFile(textFile('', 'empty.csv'))).rejects.toThrow(SpreadsheetError);
  });

  it('великий прайс читається повністю, без обрізання хвоста', async () => {
    const lines = ['Код;Ціна', ...Array.from({ length: 70_000 }, (_, i) => `K${i};${i}`)];
    const sheets = await readSpreadsheetFile(textFile(lines.join('\n'), 'big.csv'));
    expect(sheets[0].rows).toHaveLength(70_001);
    expect(sheets[0].rows[70_000]).toEqual(['K69999', '69999']);
  });

  it('понад 200 000 рядків — помилка, а не мовчазне обрізання', async () => {
    const lines = Array.from({ length: 200_001 }, (_, i) => `K${i};${i}`);
    await expect(readSpreadsheetFile(textFile(lines.join('\n'), 'huge.csv'))).rejects.toThrow(/200\s000/u);
  });
});

describe('csv', () => {
  it('роздільник визначається за вмістом', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
  });

  it('лапки й крапка з комою всередині значення', () => {
    expect(parseCsv('a;"б;в";г')).toEqual([['a', 'б;в', 'г']]);
    expect(parseCsv('a;"він сказав ""ні""";в')).toEqual([['a', 'він сказав "ні"', 'в']]);
  });

  it('буква колонки', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
  });
});
