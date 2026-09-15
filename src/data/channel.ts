// Канал між вкладками. У браузері — BroadcastChannel (не доставляє повідомлення самому відправнику);
// у тестах — пам'ятний хаб з тією самою семантикою.

export interface ChannelLike {
  post(message: unknown): void;
  subscribe(listener: (message: unknown) => void): () => void;
  close(): void;
}

export type ChannelFactory = (name: string) => ChannelLike | null;

export const openBroadcastChannel: ChannelFactory = (name) => {
  if (typeof BroadcastChannel === 'undefined') return null;
  const bc = new BroadcastChannel(name);
  const listeners = new Set<(m: unknown) => void>();
  bc.onmessage = (e: MessageEvent) => {
    for (const l of listeners) l(e.data);
  };
  return {
    post: (m) => bc.postMessage(m),
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    close: () => bc.close(),
  };
};

/** Хаб каналів у пам'яті: синхронна доставка всім учасникам з тією самою назвою, крім відправника. */
export function createMemoryChannelHub(): ChannelFactory {
  const members = new Map<string, Set<Set<(m: unknown) => void>>>();
  return (name) => {
    const own = new Set<(m: unknown) => void>();
    const group = members.get(name) ?? new Set();
    members.set(name, group);
    group.add(own);
    return {
      post: (m) => {
        for (const member of group) {
          if (member === own) continue;
          for (const l of member) l(structuredCloneSafe(m));
        }
      },
      subscribe: (l) => {
        own.add(l);
        return () => own.delete(l);
      },
      close: () => group.delete(own),
    };
  };
}

function structuredCloneSafe<T>(v: T): T {
  return typeof structuredClone === 'function' ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T);
}
