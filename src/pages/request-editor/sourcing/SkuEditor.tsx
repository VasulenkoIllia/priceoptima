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

/** Список підказок відкрито — Enter і стрілки обробляє підказка, а не сітка (див. suppressKeyboardEvent у SourcingGrid). */
let suggestOpen = false;
export const isSkuSuggestOpen = (): boolean => suggestOpen;

function SuggestOption({ product }: { product: ProductPickDto }) {
  return (
    <span className="po-sku-opt">
      <b className="po-num">{product.sku}</b>
      <span className="po-sku-opt-name">{product.nameWork}</span>
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
    queryFn: () => ds.searchProducts({ q, supplierId, limit: 8 }),
    enabled: q.length >= 2,
    staleTime: 15_000,
  });
  const options = q.length >= 2 ? (search.data ?? []).map((product) => ({ value: product.sku, label: <SuggestOption product={product} /> })) : [];
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
      onChange={(v: string) => {
        setText(v);
        setOpen(true);
        p.onValueChange(v);
      }}
      onSelect={(v: string) => {
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
