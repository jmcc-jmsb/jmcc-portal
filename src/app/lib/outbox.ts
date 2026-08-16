// ABOUTME: The offline send queue for messages — IndexedDB, flushed on reconnect.
// ABOUTME: Messages queue. Submissions and signing never do; they fail loudly (HANDOFF §8).
import { useEffect, useState } from 'react';

/* §8 is explicit about the asymmetry, and it is the right one:
   "Offline write queue: message sends queue in IndexedDB and flush on reconnect,
   with a visible pending state and confirmation on send. Submissions and signing
   never queue — they fail loudly."

   A message that arrives four minutes late is a message. A case submission that
   arrives four minutes late is a missed deadline that the delegate was told had
   been made — so nothing in this file is ever wired to /submit. */

const DB_NAME = 'jmcc-outbox';
const DB_VERSION = 1;
const STORE = 'messages';

export type QueuedMessage = {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  queuedAt: number;
  attempts: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function enqueue(message: Omit<QueuedMessage, 'queuedAt' | 'attempts'>): Promise<void> {
  await withStore('readwrite', (store) =>
    store.put({ ...message, queuedAt: Date.now(), attempts: 0 } satisfies QueuedMessage),
  );
}

export async function pending(): Promise<QueuedMessage[]> {
  const all = await withStore<QueuedMessage[]>('readonly', (store) => store.getAll() as IDBRequest<QueuedMessage[]>);
  return all.sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function drop(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id) as unknown as IDBRequest<undefined>);
}

export async function bumpAttempts(message: QueuedMessage): Promise<void> {
  await withStore('readwrite', (store) => store.put({ ...message, attempts: message.attempts + 1 }));
}

/** Give up after this many tries, so one poisoned row cannot block the queue forever. */
export const MAX_ATTEMPTS = 5;

/**
 * Send everything queued, oldest first.
 *
 * Sequential rather than parallel: these are messages in a conversation and
 * arriving out of order would read as nonsense. A permanent failure is dropped
 * after MAX_ATTEMPTS rather than retried until the end of time.
 */
export async function flush(
  send: (message: QueuedMessage) => Promise<string | null>,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const message of await pending()) {
    const error = await send(message);
    if (!error) {
      await drop(message.id);
      sent += 1;
      continue;
    }

    failed += 1;
    if (message.attempts + 1 >= MAX_ATTEMPTS) {
      // Kept out of the way rather than retried forever. The composer reports
      // the count, so a message that will never send is visible rather than
      // silently gone.
      await drop(message.id);
    } else {
      await bumpAttempts(message);
    }
    // Stop on the first failure: if the network is down, the rest will fail too,
    // and burning four more attempts on each is how a queue empties itself.
    break;
  }

  return { sent, failed };
}

/**
 * The visible pending state §8 asks for, plus the flush on reconnect.
 *
 * Also flushes when the tab becomes visible: a phone that regained signal while
 * the screen was off never fires an `online` event that a frozen tab can hear.
 */
export function useOutbox(send: (message: QueuedMessage) => Promise<string | null>): {
  count: number;
  refresh: () => void;
} {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (typeof indexedDB === 'undefined') return;
      try {
        const queued = await pending();
        if (!cancelled) setCount(queued.length);
      } catch {
        // Private browsing can refuse IndexedDB outright. No queue is a working
        // state — sends just fail loudly instead, which is the old behaviour.
      }
    };

    const attempt = async () => {
      if (typeof indexedDB === 'undefined' || !navigator.onLine) return;
      try {
        await flush(send);
      } catch {
        // Ignored on purpose: the next reconnect tries again.
      }
      await refresh();
    };

    void attempt();

    const onOnline = () => void attempt();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void attempt();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [send]);

  return { count, refresh: () => void pending().then((queued) => setCount(queued.length)) };
}
