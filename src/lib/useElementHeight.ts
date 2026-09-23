// Висота елемента (ResizeObserver): для таблиць, що займають решту висоти вкладки.
// Callback-ref: елемент може з'явитися не з першого рендеру (спершу заглушка чи завантаження).
import { useEffect, useState } from 'react';

export function useElementHeight<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setHeight(Math.floor(entry?.contentRect.height ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, height];
}
