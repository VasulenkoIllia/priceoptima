// Редактор артикула в клітинці блоку (РЕД-5): автопідказка з каталогу постачальника блоку від 2 символів.
// Вибір підказки — одразу пропозиція (далі звичний шлях через onCellEditRequest → enterSku).
import { useQuery } from '@tanstack/react-query';
import { AutoComplete, type GetRef } from 'antd';
import type { CustomCellEditorProps } from 'ag-grid-react';
import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@shared/format';
import type { ProductPickDto } from '@shared/types';
import { ds } from '@/data';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { parseColId } from './colIds';
import type { SourcingGridContext } from './gridContext';
import type { SourcingRow } from './rows';

/** Скільки підказок просимо (правки замовника 28.09 п.1): усі збіги з прокруткою; більше — просимо уточнити запит. */
export const SKU_SUGGEST_LIMIT = 100;
/** Висота списку: ~12 рядків, решта прокручується. */
const SUGGEST_LIST_HEIGHT = 12 * 32;
const MORE_HINT = '__more';

/**
 * Що показати з видачі пошуку. Є товари з усіма словами запиту — часткові збіги (лише частина слів) не показуємо:
 * «коліно 40» звужує список, а не доповнює його «просто колінами». more — видача дійшла до межі, збігів може бути більше.
 */
export function skuSuggestions(hits: ProductPickDto[], limit = SKU_SUGGEST_LIMIT): { items: ProductPickDto[]; more: boolean } {
  const full = hits.filter((h) => h.matchKind !== 'fuzzy');
  const items = full.length ? full : hits;
  return { items, more: hits.length >= limit && items.length === hits.length };
}

/** Список підказок відкрито — Enter і стрілки обробляє підказка, а не сітка (див. suppressKeyboardEvent у SourcingGrid). */
let suggestOpen = false;
export const isSkuSuggestOpen = (): boolean => suggestOpen;

function SuggestOption({ product }: { product: ProductPickDto }) {
  return (
    <span className="po-sku-opt">
      <b className="po-num">{product.sku}</b>
      {/* повна назва — підказкою при наведенні; рядок не розгортається, щоб список не стрибав (правки замовника 25.09 п.7) */}
      <span className="po-sku-opt-name" title={product.nameWork}>
        {product.nameWork}
      </span>
      <span className="po-num po-muted">{product.purchasePriceUah != null ? `${formatMoney(product.purchasePriceUah)} грн` : ''}</span>
    </span>
  );
}

export function SkuEditor(p: CustomCellEditorProps<SourcingRow, string, SourcingGridContext>) {
  const col = parseColId(p.column.getColId());
  const supplierId = col.kind === 'block' ? (p.context.blockOf(col.blockId)?.supplierId ?? null) : null;
  // введення почалось з друкованої клавіші — з неї й починаємо; інакше — поточний артикул
  const [text, setText] = useState<string>(() => (p.eventKey && p.eventKey.length === 1 ? p.eventKey : (p.value ?? '')));
  const [open, setOpen] = useState(true);
  const ref = useRef<GetRef<typeof AutoComplete>>(null);
  const q = useDebouncedValue(text.trim(), 150);
  const search = useQuery({
    queryKey: ['sku-suggest', supplierId, q],
    queryFn: () => ds.searchProducts({ q, supplierId, limit: SKU_SUGGEST_LIMIT }),
    enabled: q.length >= 2,
    staleTime: 15_000,
  });
  const found = skuSuggestions(q.length >= 2 ? (search.data ?? []) : []);
  const options = found.items.map((product) => ({ value: product.sku, label: <SuggestOption product={product} /> }));
  // збігів може бути більше за межу — останнім рядком підказка (не вибирається)
  if (found.more) {
    options.push({
      value: MORE_HINT,
      label: <span className="po-muted">Перші {SKU_SUGGEST_LIMIT}. Уточніть запит, напр. «коліно 40», або F4</span>,
      disabled: true,
    } as (typeof options)[number]);
  }
  const shown = open && options.length > 0;

  // лише при відкритті: фокус і стартова клавіша як значення редактора
  useEffect(() => {
    ref.current?.focus();
    if (p.eventKey && p.eventKey.length === 1) p.onValueChange(p.eventKey);
  }, []);

  useEffect(() => {
    suggestOpen = shown;
    return () => {
      suggestOpen = false;
    };
  }, [shown]);

  return (
    <AutoComplete
      ref={ref}
      className="po-sku-editor"
      variant="borderless"
      value={text}
      options={options}
      open={shown}
      popupMatchSelectWidth={440}
      listHeight={SUGGEST_LIST_HEIGHT}
      onChange={(v: string) => {
        setText(v);
        setOpen(true);
        p.onValueChange(v);
      }}
      onSelect={(v: string) => {
        if (v === MORE_HINT) return;
        setText(v);
        setOpen(false);
        suggestOpen = false;
        p.onValueChange(v);
        window.setTimeout(() => p.stopEditing(), 0);
      }}
      onBlur={() => setOpen(false)}
      placeholder="артикул…"
    />
  );
}
