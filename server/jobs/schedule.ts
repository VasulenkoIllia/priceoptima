// Щоденні завдання без зовнішніх залежностей: один setTimeout до найближчого часу запуску,
// після кожного запуску час перераховується заново. Час — київський (як і все в системі),
// тож перехід на літній час зсуває найближчий запуск не більше ніж на годину й далі вирівнюється сам.
import { formatTime } from '@shared/format';

const DAY_MS = 86_400_000;

/** Скільки мілісекунд лишилось до найближчих hour:minute за київським часом. */
export function msUntilDaily(now: Date, hour: number, minute: number): number {
  const [hh, mm, ss] = formatTime(now).split(':').map(Number);
  const current = ((hh * 60 + mm) * 60 + ss) * 1000;
  const target = (hour * 60 + minute) * 60 * 1000;
  const delta = target - current;
  return delta > 0 ? delta : delta + DAY_MS;
}

export interface ScheduledTask {
  stop(): void;
}

export interface DailyTaskOptions {
  /** Година запуску за київським часом, 0–23. */
  hour: number;
  /** Хвилина запуску, 0–59. */
  minute: number;
  /** Саме завдання; про свої помилки воно повідомляє саме — розклад від них не зупиняється. */
  run: () => void | Promise<void>;
  /** Поточний час (для тестів). */
  now?: () => Date;
}

/** Запускає завдання щодня о hour:minute. Таймер не тримає процес — сервер зупиняється за сигналом docker. */
export function scheduleDaily(options: DailyTaskOptions): ScheduledTask {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const plan = (): void => {
    if (stopped) return;
    const delay = msUntilDaily(options.now?.() ?? new Date(), options.hour, options.minute);
    timer = setTimeout(() => {
      void Promise.resolve()
        .then(() => options.run())
        .catch(() => undefined)
        .finally(plan);
    }, delay);
    timer.unref?.();
  };

  plan();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
