// Довгі випадні меню (постачальники) — до низу вікна від кнопки, решта прокручується (правки замовника 09.10: з новими
// постачальниками нижні пункти виходили за край екрана й їх не можна було вибрати).
import { useRef, useState, type CSSProperties } from 'react';

/** Відступ від краю вікна й найменша висота меню, px. */
const GAP = 16;
const MIN_HEIGHT = 160;

/**
 * Висота меню для кнопки від buttonTop до buttonBottom у вікні висотою viewport: місце під кнопкою; замало (кнопка внизу
 * вікна) — місце над нею (меню відкриється вгору).
 */
export function menuMaxHeight(buttonTop: number, buttonBottom: number, viewport: number): number {
  const below = viewport - buttonBottom - GAP;
  const space = below >= MIN_HEIGHT ? below : Math.max(below, buttonTop - GAP);
  return Math.max(MIN_HEIGHT, Math.floor(space));
}

/** ref — на кнопку, onOpenChange і style — у Dropdown (style — у menu). */
export function useMenuFit<T extends HTMLElement = HTMLButtonElement>() {
  const ref = useRef<T>(null);
  const [maxHeight, setMaxHeight] = useState<number>();
  const onOpenChange = (open: boolean) => {
    const rect = ref.current?.getBoundingClientRect();
    if (open && rect) setMaxHeight(menuMaxHeight(rect.top, rect.bottom, window.innerHeight));
  };
  const style: CSSProperties | undefined = maxHeight ? { maxHeight, overflowY: 'auto' } : undefined;
  return { ref, onOpenChange, style };
}
