// Вкладка «Позиції і підбір»: панель інструментів, сітка (режими «Підбір» / «Порівняння»), бічна панель, сценарії, діалоги.
import { useEffect, useMemo, useRef } from 'react';
import { normalizeUnit } from '@shared/parse';
import type { UUID } from '@shared/types';
import { closePicker, CreateProductDialog, ProductPickerHost } from '@/components/ProductPicker';
import { useRequestComputed, useRequestDoc } from '@/stores/requestDocStore';
import { useUiPrefs } from '@/stores/uiPrefsStore';
import { AmbiguousSkuDialog } from './AmbiguousSkuDialog';
import { OfferDrawer } from './OfferDrawer';
import { buildLineRows, countByFilter, type LineRow } from './rows';
import { ScenariosPanel } from './ScenariosPanel';
import { SourcingGrid } from './SourcingGrid';
import { SourcingToolbar } from './SourcingToolbar';
import { useSourcingUi } from './sourcingUiStore';
import './sourcing.css';

/** «Створити товар» для клітинки блоку з невідомим артикулом. */
function CreateProductForCell() {
  const target = useSourcingUi((s) => s.createProduct);
  const close = useSourcingUi((s) => s.openCreateProduct);
  const setMiss = useSourcingUi((s) => s.setMiss);
  const line = useRequestDoc((s) => (target ? s.doc?.lines.find((l) => l.id === target.lineId) : undefined));
  const supplierId = useRequestDoc((s) => (target ? (s.doc?.blocks.find((b) => b.id === target.blockId)?.supplierId ?? null) : null));
  return (
    <CreateProductDialog
      open={!!target && !!line}
      lineId={target?.lineId ?? null}
      blockId={target?.blockId ?? null}
      supplierId={supplierId}
      initial={{ sku: target?.sku, nameWork: line?.clientName, unitCode: normalizeUnit(line?.clientUnit) }}
      onClose={() => close(null)}
      onCreated={() => target && setMiss(target.lineId, target.blockId, null)}
    />
  );
}

/** Після вибору в каталозі підказки невдалих артикулів у цих клітинках більше не потрібні. */
function clearMisses(info: { lineId: UUID; blockIds: UUID[] }): void {
  useSourcingUi.getState().setMisses(info.blockIds.map((blockId) => ({ lineId: info.lineId, blockId, miss: null })));
}

export default function SourcingTab() {
  const requestId = useRequestDoc((s) => s.requestId);
  const doc = useRequestDoc((s) => s.doc);
  const computed = useRequestComputed();
  const misses = useSourcingUi((s) => s.skuMisses);
  const mode = useUiPrefs((s) => s.editorMode);
  const scenariosOpen = useUiPrefs((s) => s.scenariosPanelOpen);

  // інша заявка — чистий стан вкладки; фільтр, пошук і прокрутка — як були в цій заявці
  useEffect(() => {
    useSourcingUi.getState().open(requestId);
    closePicker();
  }, [requestId]);

  // рядки будуються тут: лічильники фільтра, панель сценаріїв і сітка працюють з одними даними; незмінені рядки зберігають посилання
  const prevRows = useRef(new Map<UUID, LineRow>());
  const allRows = useMemo(() => {
    if (!doc || !computed) return [];
    const rows = buildLineRows({ doc, computed, misses, prev: prevRows.current });
    prevRows.current = new Map(rows.map((r) => [r.id, r]));
    return rows;
  }, [doc, computed, misses]);
  const counts = useMemo(() => countByFilter(allRows), [allRows]);

  if (!doc || !computed) return null;
  return (
    <div className="po-sourcing">
      <SourcingToolbar counts={counts} />
      <div className="po-sourcing-body">
        <div className="po-sourcing-grid">
          <SourcingGrid mode={mode} allRows={allRows} />
        </div>
        {scenariosOpen ? <ScenariosPanel counts={counts} /> : null}
        <OfferDrawer />
      </div>
      <CreateProductForCell />
      <AmbiguousSkuDialog />
      <ProductPickerHost onAdded={clearMisses} />
    </div>
  );
}
