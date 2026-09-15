/** 1 → '000001' */
export function formatRequestNumber(n: number): string {
  return String(Math.trunc(n)).padStart(6, '0');
}

/** (2114, 1) → '2114 / 000001' */
export function formatKpNumber(kpNumber: number, requestNumber: number): string {
  return `${Math.trunc(kpNumber)} / ${formatRequestNumber(requestNumber)}`;
}
