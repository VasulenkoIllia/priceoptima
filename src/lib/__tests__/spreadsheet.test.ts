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

describe('XML-вигрузка прайсу (правки замовника 28.09)', () => {
  // вигадані товари у форматі кабінету постачальника (Prom): штрихкод — наш код товару, ціна з ПДВ, по 2 фото
  const PROM = `<?xml version="1.0" encoding="UTF-8"?>
<shop><catalog/><items>
<item id="101" selling_type="r"><name>Муфта с наружной резьбой 25х1"</name><name_ua>Муфта з зовнішньою різьбою 25х1"</name_ua>
<priceuah>43.34</priceuah><image>https://img.example/a1.jpeg</image><image>https://img.example/a2.jpeg</image>
<vendor>Тест</vendor><vendorCode>1003025004001</vendorCode><barcode>000000101</barcode><param name="Тип">Муфта</param>
<description_ua><![CDATA[<p>Опис</p>]]></description_ua><available>true</available></item>
<item id="102"><name>Кран</name><priceuah>10</priceuah><vendor>Тест</vendor><barcode>000000102</barcode><available>false</available></item>
</items></shop>`;
  const YML = `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="2026-09-28"><shop><offers>
<offer id="7" available="true"><price>12.5</price><currencyId>UAH</currencyId><picture>https://img.example/y.jpg</picture>
<name>Трійник 20</name><param name="Артикул">TR-20</param></offer>
</offers></shop></yml_catalog>`;

  it('Prom: таблиця з колонками, які впізнає діалог прайсу; українська назва; наявність і фото', async () => {
    const [sheet] = await readSpreadsheetFile(textFile(PROM, 'fitingi-prom.xml'));
    expect(sheet.rows[0]).toEqual(['Код (штрихкод)', 'Артикул', 'Назва', 'Бренд', 'Ціна з ПДВ', 'Валюта', 'Наявність', 'Фото', 'ID у вигрузці']);
    expect(sheet.rows[1]).toEqual([
      '000000101',
      '1003025004001',
      'Муфта з зовнішньою різьбою 25х1"',
      'Тест',
      '43.34',
      '',
      'є',
      'https://img.example/a1.jpeg https://img.example/a2.jpeg',
      '101',
    ]);
    expect(sheet.rows[2].slice(0, 7)).toEqual(['000000102', '', 'Кран', 'Тест', '10', '', 'немає']);
  });

  it('YML: артикул із параметра, фото з picture, наявність з атрибута', async () => {
    const [sheet] = await readSpreadsheetFile(textFile(YML, 'rozetka.xml'));
    expect(sheet.rows[1]).toEqual(['', 'TR-20', 'Трійник 20', '', '12.5', 'UAH', 'є', 'https://img.example/y.jpg', '7']);
  });

  it('пошкоджений XML чи без товарів — зрозуміла помилка', async () => {
    await expect(readSpreadsheetFile(textFile('<shop><items>', 'bad.xml'))).rejects.toBeInstanceOf(SpreadsheetError);
    await expect(readSpreadsheetFile(textFile('<shop><items></items></shop>', 'empty.xml'))).rejects.toThrow('У XML немає товарів');
  });
});
