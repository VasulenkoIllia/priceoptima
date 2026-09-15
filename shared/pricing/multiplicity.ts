import { round3 } from './money';

export interface MultiplicityCheck {
  isMultiple: boolean;
  suggestedQty: number | null;
}

/** F19: кратність. m = multiplicity ?? 1; некратна к-сть → округлення вгору до кратної. */
export function checkMultiplicity(qty: number, multiplicity: number | null | undefined): MultiplicityCheck {
  const m = multiplicity ?? 1;
  if (!(m > 0) || !Number.isFinite(qty)) return { isMultiple: true, suggestedQty: qty };
  const ratio = qty / m;
  const isMultiple = Math.abs(ratio - Math.round(ratio)) < 1e-9;
  return { isMultiple, suggestedQty: isMultiple ? qty : round3(Math.ceil(ratio - 1e-9) * m) };
}

/**
 * К-сть пропозиції при виборі товару: якщо автоокруглення увімкнено і к-сть рядка некратна —
 * кратна вгору (118 → 120), інакше null (= к-сть рядка).
 */
export function initialOfferQty(lineQty: number, multiplicity: number | null | undefined, autoRound: boolean): number | null {
  if (!autoRound || !(lineQty > 0)) return null;
  const check = checkMultiplicity(lineQty, multiplicity);
  return check.isMultiple ? null : check.suggestedQty;
}
