// Детермінований генератор псевдовипадкових чисел (mulberry32) з допоміжними методами.
// Однаковий seed → однакова послідовність на будь-якій платформі (лише 32-бітна цілочислова арифметика).

/** 32-бітний хеш рядка (FNV-1a) — для отримання незалежних потоків за міткою. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly nextFn: () => number;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.nextFn = mulberry32(this.seed);
  }

  /** Незалежний потік для підзадачі: зміни в одній підзадачі не зсувають інші. */
  fork(label: string): Rng {
    return new Rng((hashString(label) ^ Math.imul(this.seed, 0x9e3779b1)) >>> 0);
  }

  /** [0, 1) */
  next(): number {
    return this.nextFn();
  }

  /** Ціле в межах [min, max] включно. */
  int(min: number, max: number): number {
    return min + Math.floor(this.nextFn() * (max - min + 1));
  }

  /** Дійсне в межах [min, max). */
  float(min: number, max: number): number {
    return min + this.nextFn() * (max - min);
  }

  chance(p: number): boolean {
    return this.nextFn() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.nextFn() * items.length)];
  }

  /** Вибір за вагами (ваги ≥ 0, хоча б одна > 0). */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.nextFn() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Перемішування Фішера–Єйтса (повертає нову копію). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.nextFn() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /** Випадкова підмножина розміру n (порядок вихідного масиву зберігається). */
  sample<T>(items: readonly T[], n: number): T[] {
    if (n >= items.length) return items.slice();
    const idx = this.shuffle(items.map((_, i) => i)).slice(0, n).sort((a, b) => a - b);
    return idx.map((i) => items[i]);
  }
}
