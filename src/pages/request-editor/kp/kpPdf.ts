// PDF бланка КП (pdfmake у браузері, окремим чанком). Кирилиця — вбудований Roboto; знака «₴» у ньому немає, тому «грн».
import type { Content, CustomTableLayout, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatMoney, formatQty } from '@shared/format';
import type { KpSnapshot } from '@shared/types';
import {
  KP_SIGN_LABEL,
  kpAmountLine,
  kpContacts,
  kpCountLine,
  kpFileName,
  kpHasHead,
  kpPartyRows,
  kpPartyTitle,
  kpTableHead,
  kpTermRows,
  kpTitle,
  kpTotalLines,
  kpValidLine,
  type KpContact,
} from './kpLayout';
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

/** Місце логотипа в шапці, pt. */
const LOGO_FIT: [number, number] = [150, 56];

/** Логотип: SVG (data URL) — як svg-вузол; PNG/JPEG — як зображення. Не вдалося — без логотипа. */
async function logoContent(url: string | null): Promise<Content | null> {
  if (!url) return null;
  try {
    if (url.startsWith('data:image/svg+xml')) {
      const comma = url.indexOf(',');
      const meta = url.slice(0, comma);
      const body = url.slice(comma + 1);
      return { svg: meta.includes(';base64') ? atob(body) : decodeURIComponent(body), fit: LOGO_FIT, alignment: 'right' };
    }
    const image = url.startsWith('data:') ? url : await blobToDataUrl(await (await fetch(url)).blob());
    return { image, fit: LOGO_FIT, alignment: 'right' };
  } catch {
    return null;
  }
}

/** Позначки контактів у шапці (у Roboto немає значків телефону й конверта). */
const CONTACT_ICONS: Record<KpContact['kind'], string> = {
  phone:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#222" d="M3.3 1.3l2.3-.2 1.3 3.3-1.7 1.2a8.5 8.5 0 0 0 5.2 5.2l1.2-1.7 3.3 1.3-.2 2.3c-.1.8-.8 1.4-1.6 1.4C7 14.1 1.9 9 1.9 2.9c0-.8.6-1.5 1.4-1.6z"/></svg>',
  email:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="1" y="3" width="14" height="10" rx="1.5" fill="#222"/><path d="M2 4.3l6 4.3 6-4.3" fill="none" stroke="#fff" stroke-width="1.3"/></svg>',
  site:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><g fill="none" stroke="#222" stroke-width="1.3"><circle cx="8" cy="8" r="6.3"/><ellipse cx="8" cy="8" rx="2.7" ry="6.3"/><path d="M1.7 8h12.6M2.7 5h10.6M2.7 11h10.6"/></g></svg>',
};

/** Рядок контактів по центру: значок + текст. */
function contactsContent(contacts: readonly KpContact[]): Content {
  return {
    columns: [
      { width: '*', text: '' },
      ...contacts.flatMap((c, i) => [
        ...(i ? [{ width: 8, text: '' } as Content] : []),
        { width: 8, svg: CONTACT_ICONS[c.kind], fit: [8, 8], margin: [0, 1.5, 0, 0] } as Content,
        { width: 'auto', text: c.text, bold: true } as Content,
      ]),
      { width: '*', text: '' },
    ],
    columnGap: 4,
    margin: [0, 8, 0, 0],
  } as Content;
}

/** Ширина колонки суми, pt: підсумки стоять під нею окремою таблицею. */
const SUM_PT = 62;

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

const INK = '#222222';

const GRID: CustomTableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => INK,
  vLineColor: () => INK,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

/** Рамка шапки: лише зовнішній контур. */
const HEAD_BOX: CustomTableLayout = {
  hLineWidth: () => 0.8,
  vLineWidth: (i, node) => (i === 0 || i === (node.table.widths?.length ?? 0) ? 0.8 : 0),
  hLineColor: () => INK,
  vLineColor: () => INK,
  paddingLeft: () => 12,
  paddingRight: () => 12,
  paddingTop: () => 8,
  paddingBottom: () => 8,
};

/** Лінія на всю ширину сторінки (A4 без полів 36 pt). */
const rule = (margin: [number, number, number, number]): Content => ({
  canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 1.5, lineColor: INK }],
  margin,
});

/** PDF-документ зі знімка (без завантаження — для файлу й перевірок). */
export async function buildKpPdf(s: KpSnapshot): Promise<ReturnType<PdfMake['createPdf']>> {
  const photoPaths = s.columns.showImages ? s.rows.map((r) => r.imagePath).filter((p): p is string => !!p) : [];
  const [lib, logo, rowPhotos] = await Promise.all([loadPdfMake(), logoContent(s.header.logoPath), loadRowPhotos(photoPaths)]);

  const parties: TableCell[][] = kpPartyRows(s).map((r) => {
    const gap = r.gap ? 8 : 0;
    if (r.kind === 'party') {
      return [
        { text: r.label, decoration: 'underline', margin: [0, 0, 0, 8] },
        {
          stack: [...(r.title ? [{ text: kpPartyTitle(r.title), bold: true, fontSize: 9 }] : []), ...r.lines.map((l) => ({ text: l, fontSize: 8 }))],
          margin: [0, 0, 0, 8],
        },
      ] as TableCell[];
    }
    return [
      { text: r.label, alignment: 'right', fontSize: 8, margin: [0, gap, 0, 0] },
      { text: r.lines.join('\n'), fontSize: 8, margin: [0, gap, 0, 0] },
    ] as TableCell[];
  });
  const photos = s.columns.showImages;
  const head: TableCell[] = kpTableHead(s).map((text) => ({ text, style: 'th' }));
  const items: TableCell[][] = s.rows.map((r) => [
    { text: String(r.n), alignment: 'center' },
    { text: r.code ?? '' },
    ...(photos ? [photoCell(r.imagePath ? rowPhotos.get(r.imagePath) : undefined)] : []),
    r.nameSecondary ? { stack: [{ text: r.name }, { text: r.nameSecondary, fontSize: 7.5, color: '#777777' }] } : { text: r.name },
    { text: r.unit, alignment: 'center' },
    { text: formatQty(r.qty), alignment: 'center' },
    { text: formatMoney(r.price), alignment: 'right' },
    { text: formatMoney(r.sum), alignment: 'right' },
  ]);
  // підсумки — окрема таблиця, що не розривається між сторінками: підпис без рамки, сума в клітинці під колонкою суми
  const totals: TableCell[][] = kpTotalLines(s).map((t) => [
    { text: t.label, alignment: 'right', bold: true, border: [false, false, false, false] } as TableCell,
    { text: formatMoney(t.value), alignment: 'right', bold: true, border: [true, true, true, true] } as TableCell,
  ]);
  const valid = kpValidLine(s);
  const terms: TableCell[][] = kpTermRows(s).map((t) => [{ text: t.label, bold: true, color: '#555555' }, { text: t.value }]);
  const contacts = kpContacts(s);
  const headText: Content = {
    stack: [
      ...(s.header.slogan ? [{ text: s.header.slogan.toLocaleUpperCase('uk-UA'), bold: true, fontSize: 9.5, alignment: 'center' } as Content] : []),
      ...(contacts.length ? [contactsContent(contacts)] : []),
    ],
    // по вертикалі — приблизно на середину висоти логотипа
    margin: [0, logo ? 12 : 0, 0, 0],
  };

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [36, 32, 36, 40],
    info: { title: kpTitle(s) },
    defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.15 },
    styles: { th: { bold: true, fontSize: 8.5, fillColor: '#C6D9F1', alignment: 'center' } },
    footer: (page, pages) => ({ text: `${page} / ${pages}`, alignment: 'right', fontSize: 7, color: '#999999', margin: [0, 12, 36, 0] }),
    content: [
      // нічого для шапки (гасла, контактів, логотипа) — без порожньої рамки
      ...(kpHasHead(s, !!logo)
        ? [{ table: { widths: logo ? ['*', LOGO_FIT[0]] : ['*'], body: [logo ? [headText, logo] : [headText]] }, layout: HEAD_BOX } as Content]
        : []),
      { text: kpTitle(s), bold: true, fontSize: 13.5, margin: [0, 16, 0, 2] },
      rule([0, 0, 0, s.final ? 4 : 12]),
      ...(s.final ? [{ text: 'Фінальна: погоджені позиції і кількості', color: '#6A1B9A', margin: [0, 0, 0, 10] } as Content] : []),
      { table: { widths: [90, '*'], body: parties }, layout: 'noBorders', margin: [0, 0, 0, 8] },
      {
        table: {
          headerRows: 1,
          widths: [18, 60, ...(photos ? [PHOTO_PT + 8] : []), '*', 34, 44, 58, SUM_PT],
          body: [head, ...items],
        },
        layout: GRID,
      },
      {
        columns: [
          { width: '*', text: '' },
          { width: 'auto', table: { widths: ['auto', SUM_PT], body: totals }, layout: GRID },
        ],
        unbreakable: true,
      } as Content,
      { text: kpCountLine(s), margin: [0, 16, 0, 0] },
      { text: kpAmountLine(s), margin: [0, 0, 0, 4] },
      ...(valid ? [{ text: valid } as Content] : []),
      ...(terms.length ? [{ table: { widths: [120, '*'], body: terms }, layout: 'noBorders', margin: [0, 8, 0, 0] } as Content] : []),
      ...(s.managerName ? [{ text: `Менеджер: ${s.managerName}`, margin: [0, 14, 0, 0] } as Content] : []),
      rule([0, 12, 0, 4]),
      ...(s.footer ? [{ text: s.footer, fontSize: 8, margin: [0, 0, 190, 0] } as Content] : []),
      {
        columns: [
          { width: '*', text: '' },
          { width: 'auto', text: KP_SIGN_LABEL },
          { width: 150, canvas: [{ type: 'line', x1: 0, y1: 10, x2: 150, y2: 10, lineWidth: 0.6, lineColor: INK }] },
        ],
        columnGap: 6,
        margin: [0, 22, 0, 0],
        unbreakable: true,
      } as Content,
    ],
  };
  return lib.createPdf(doc);
}

export async function downloadKpPdf(s: KpSnapshot, version?: number): Promise<void> {
  await (await buildKpPdf(s)).download(kpFileName(s, 'pdf', version));
}
