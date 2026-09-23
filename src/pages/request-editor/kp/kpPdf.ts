// PDF бланка КП (pdfmake у браузері, окремим чанком). Кирилиця — вбудований Roboto; знака «₴» у ньому немає, тому «грн».
import type { Content, CustomTableLayout, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatMoney, formatQty } from '@shared/format';
import type { KpSnapshot } from '@shared/types';
import { BRAND_COLOR } from '@/theme';
import { kpAmountLine, kpContactsLine, kpFileName, kpPartyRows, kpTermRows, kpTitle, kpTotalLines, kpValidLine } from './kpLayout';
import { loadRowPhotos } from './kpPhotos';

type PdfMake = typeof import('pdfmake/build/pdfmake');

let pdfMake: Promise<PdfMake> | null = null;

function loadPdfMake(): Promise<PdfMake> {
  pdfMake ??= Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]).then(([pm, fonts]) => {
    const lib = ((pm as unknown as { default?: PdfMake }).default ?? pm) as PdfMake;
    const vfs = (fonts as unknown as { default?: unknown }).default ?? fonts;
    lib.addVirtualFileSystem(vfs as Parameters<PdfMake['addVirtualFileSystem']>[0]);
    return lib;
  });
  return pdfMake;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Логотип: SVG (data URL) — як svg-вузол; PNG/JPEG — як зображення. Не вдалося — без логотипа. */
async function logoContent(url: string | null): Promise<Content | null> {
  if (!url) return null;
  try {
    if (url.startsWith('data:image/svg+xml')) {
      const comma = url.indexOf(',');
      const meta = url.slice(0, comma);
      const body = url.slice(comma + 1);
      return { svg: meta.includes(';base64') ? atob(body) : decodeURIComponent(body), width: 52 };
    }
    const image = url.startsWith('data:') ? url : await blobToDataUrl(await (await fetch(url)).blob());
    return { image, fit: [120, 52] };
  } catch {
    return null;
  }
}

/** Фото товару в бланку: сторона клітинки. */
const PHOTO_PT = 26;

/** Місце під фото товару. */
const PHOTO_PLACEHOLDER =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="0.5" y="0.5" width="23" height="23" rx="3" fill="#F0F2F5" stroke="#D5DAE1"/>' +
  '<g fill="none" stroke="#A0A8B4" stroke-width="1.4"><rect x="5" y="7" width="14" height="10" rx="1.5"/><circle cx="9.5" cy="10.5" r="1.4"/><path d="M6 16l4-4 3 3 2-2 3 3"/></g></svg>';

/** Клітинка з фото; фото немає або не завантажилось — місце під нього. */
function photoCell(image: string | undefined): TableCell {
  return image
    ? ({ image, fit: [PHOTO_PT, PHOTO_PT], alignment: 'center' } as TableCell)
    : ({ svg: PHOTO_PLACEHOLDER, width: 22, alignment: 'center' } as TableCell);
}

const GRID: CustomTableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => '#B8C2D0',
  vLineColor: () => '#B8C2D0',
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

/** PDF-документ зі знімка (без завантаження — для файлу й перевірок). */
export async function buildKpPdf(s: KpSnapshot): Promise<ReturnType<PdfMake['createPdf']>> {
  const photoPaths = s.columns.showImages ? s.rows.map((r) => r.imagePath).filter((p): p is string => !!p) : [];
  const [lib, logo, rowPhotos] = await Promise.all([loadPdfMake(), logoContent(s.header.logoPath), loadRowPhotos(photoPaths)]);

  const parties: TableCell[][] = kpPartyRows(s).map((r) => [
    { text: r.label, bold: true, color: '#555555' },
    { stack: [...(r.title ? [{ text: r.title, bold: true }] : []), ...r.lines.map((l) => ({ text: l }))] },
  ]);
  const photos = s.columns.showImages;
  const head: TableCell[] = ['№', 'Код', ...(photos ? ['Фото'] : []), 'Товари (роботи, послуги)', 'Од.', 'Кількість', s.columns.priceHeader, s.columns.sumHeader].map(
    (text) => ({ text, style: 'th' }),
  );
  const items: TableCell[][] = s.rows.map((r) => [
    { text: String(r.n), alignment: 'center' },
    { text: r.code ?? '' },
    ...(photos ? [photoCell(r.imagePath ? rowPhotos.get(r.imagePath) : undefined)] : []),
    r.nameSecondary ? { stack: [{ text: r.name }, { text: r.nameSecondary, fontSize: 7.5, color: '#777777' }] } : { text: r.name },
    { text: r.unit, alignment: 'center' },
    { text: formatQty(r.qty), alignment: 'right' },
    { text: formatMoney(r.price), alignment: 'right' },
    { text: formatMoney(r.sum), alignment: 'right' },
  ]);
  const totals: TableCell[][] = kpTotalLines(s).map((t) => [
    { text: t.label, alignment: 'right', bold: !!t.strong },
    { text: formatMoney(t.value), alignment: 'right', bold: !!t.strong },
  ]);
  const valid = kpValidLine(s);
  const terms: TableCell[][] = kpTermRows(s).map((t) => [{ text: t.label, bold: true, color: '#555555' }, { text: t.value }]);

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [36, 32, 36, 40],
    info: { title: kpTitle(s) },
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.15 },
    styles: { th: { bold: true, fontSize: 8.5, fillColor: '#EEF2F8', alignment: 'center' } },
    footer: (page, pages) => ({ text: `${page} / ${pages}`, alignment: 'right', fontSize: 7, color: '#999999', margin: [0, 12, 36, 0] }),
    content: [
      {
        columns: [
          ...(logo ? [{ width: 'auto', stack: [logo] } as Content] : []),
          {
            width: '*',
            margin: [logo ? 10 : 0, 8, 0, 0],
            stack: [
              ...(s.header.slogan ? [{ text: s.header.slogan, bold: true, fontSize: 11, color: BRAND_COLOR }] : []),
              { text: kpContactsLine(s), fontSize: 8, color: '#555555', margin: [0, 2, 0, 0] },
            ],
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 523, y2: 4, lineWidth: 1.2, lineColor: BRAND_COLOR }], margin: [0, 2, 0, 10] },
      { text: kpTitle(s), bold: true, fontSize: 13, alignment: 'center', margin: [0, 0, 0, s.final ? 2 : 10] },
      ...(s.final ? [{ text: 'Фінальна: погоджені позиції і кількості', alignment: 'center', color: '#6A1B9A', margin: [0, 0, 0, 10] } as Content] : []),
      { table: { widths: [88, '*'], body: parties }, layout: 'noBorders', margin: [0, 0, 0, 10] },
      { table: { headerRows: 1, widths: [18, 60, ...(photos ? [PHOTO_PT + 8] : []), '*', 28, 44, 60, 68], body: [head, ...items] }, layout: GRID },
      {
        columns: [
          { width: '*', text: '' },
          { width: 'auto', table: { widths: ['auto', 84], body: totals }, layout: 'noBorders' },
        ],
        margin: [0, 8, 0, 6],
      },
      { text: kpAmountLine(s), margin: [0, 0, 0, 4] },
      ...(valid ? [{ text: valid } as Content] : []),
      ...(terms.length ? [{ table: { widths: [120, '*'], body: terms }, layout: 'noBorders', margin: [0, 8, 0, 0] } as Content] : []),
      { text: `Менеджер: ${s.managerName}`, margin: [0, 14, 0, 0] },
      ...(s.footer ? [{ text: s.footer, fontSize: 8, color: '#666666', margin: [0, 8, 0, 0] } as Content] : []),
    ],
  };
  return lib.createPdf(doc);
}

export async function downloadKpPdf(s: KpSnapshot, version?: number): Promise<void> {
  await (await buildKpPdf(s)).download(kpFileName(s, 'pdf', version));
}
