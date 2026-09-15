import type { RequestLine } from '../types';

/** F12: активний рядок (рахується в покритті, сценаріях і підсумках). */
export function isActiveLine(line: Pick<RequestLine, 'clientName' | 'qty'>): boolean {
  return line.clientName.trim() !== '' || line.qty > 0;
}
