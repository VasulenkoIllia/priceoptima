// Протягування за куточок клітинки, як в Excel, для будь-якої сітки AG Grid («Підбір»: од. і к-сть; «Націнка»: спосіб і %):
// підсвітка діапазону, автопрокрутка біля краю, Escape — скасувати, заповнення на відпусканні.
import type { GridApi } from 'ag-grid-community';
import type { MouseEvent as ReactMouseEvent } from 'react';

export interface FillDragOptions {
  event: ReactMouseEvent<HTMLElement>;
  /** Лише для прокрутки до рядка — тип рядків неважливий. */
  api: GridApi<any>;
  colId: string;
  /** Id рядків у порядку показу; індекс = row-index рядка в сітці. */
  displayed: readonly string[];
  sourceId: string;
  /** Рядки між джерелом і рядком, де відпустили мишу (без джерела). */
  onApply(targetIds: string[]): void;
}

/** Протягування: рядки між джерелом і рядком, де відпустили мишу (вниз або вгору), без самого джерела. */
export function dragTargets(displayed: readonly string[], sourceId: string, toIndex: number): string[] {
  const from = displayed.indexOf(sourceId);
  if (from < 0 || toIndex === from) return [];
  const to = Math.max(0, Math.min(toIndex, displayed.length - 1));
  return to > from ? displayed.slice(from + 1, to + 1) : displayed.slice(to, from);
}

/** Почати протягування; повертає функцію скасування (null — не почалось). */
export function startFillDrag({ event: e, api, colId, displayed, sourceId, onApply }: FillDragOptions): (() => void) | null {
  const root = e.currentTarget.closest<HTMLElement>('.ag-root-wrapper');
  const cell = e.currentTarget.closest<HTMLElement>('.ag-cell');
  const from = displayed.indexOf(sourceId);
  if (!root || !cell || e.button !== 0 || from < 0) return null;
  e.preventDefault();
  const x = cell.getBoundingClientRect().left + cell.offsetWidth / 2;
  let to = from;
  let pointerY = e.clientY;
  let frame = 0;
  let lastScroll = 0;

  const paint = () => {
    root.querySelectorAll('.po-fill-range').forEach((el) => el.classList.remove('po-fill-range'));
    const [lo, hi] = to > from ? [from + 1, to] : [to, from - 1];
    for (let i = lo; i <= hi; i++) {
      root.querySelector(`.ag-row[row-index="${i}"] .ag-cell[col-id="${colId}"]`)?.classList.add('po-fill-range');
    }
  };
  /** Смуга рядків (між шапкою й рядком підсумків). */
  const bodyBounds = () => {
    const r = root.getBoundingClientRect();
    const top = root.querySelector('.ag-header')?.getBoundingClientRect().bottom ?? r.top;
    const bottom = root.querySelector('.ag-row-pinned')?.getBoundingClientRect().top ?? r.bottom;
    return { top, bottom };
  };
  /** Рядок під курсором (за межами смуги рядків — крайній видимий). */
  const locate = () => {
    const b = bodyBounds();
    const y = Math.max(b.top + 2, Math.min(pointerY, b.bottom - 2));
    const rowEl = document.elementFromPoint(x, y)?.closest<HTMLElement>('.ag-row[row-index]');
    const index = Number(rowEl?.getAttribute('row-index'));
    if (rowEl && Number.isInteger(index)) to = Math.min(index, displayed.length - 1);
  };
  /** 1 / −1 — курсор біля нижнього / верхнього краю смуги рядків (автопрокрутка), 0 — всередині. */
  const edgeDir = () => {
    const b = bodyBounds();
    return pointerY > b.bottom - 24 ? 1 : pointerY < b.top + 24 ? -1 : 0;
  };
  // біля краю — прокрутка по рядку (~12 рядків за секунду)
  const track = (time: number) => {
    const dir = edgeDir();
    if (dir && time - lastScroll > 80) {
      lastScroll = time;
      to = Math.max(0, Math.min(to + dir, displayed.length - 1));
      api.ensureIndexVisible(to, dir > 0 ? 'bottom' : 'top');
    } else if (!dir) locate();
    paint();
    frame = requestAnimationFrame(track);
  };
  const onMove = (ev: MouseEvent) => {
    pointerY = ev.clientY;
    if (!edgeDir()) locate();
  };
  const finish = (apply: boolean) => {
    cancelAnimationFrame(frame);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('keydown', onKey, true);
    document.body.classList.remove('po-filling');
    root.querySelectorAll('.po-fill-range').forEach((el) => el.classList.remove('po-fill-range'));
    if (apply) onApply(dragTargets(displayed, sourceId, to));
  };
  const onUp = (ev: MouseEvent) => {
    pointerY = ev.clientY;
    // швидкий рух, коли кадр ще не встиг — рядок під курсором; після автопрокрутки лишається її рядок
    if (!lastScroll || !edgeDir()) locate();
    finish(true);
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    finish(false);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('keydown', onKey, true);
  document.body.classList.add('po-filling');
  frame = requestAnimationFrame(track);
  return () => finish(false);
}
