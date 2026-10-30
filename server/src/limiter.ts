import { UserError } from './errors.ts';

/** Runs at most `concurrency` tasks at once and queues up to `maxQueued` more. */
export function createLimiter(concurrency: number, maxQueued: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active < concurrency) {
      active++;
    } else {
      if (waiting.length >= maxQueued) throw new UserError('The server is busy right now — try again in a minute.', 503, 'busy');
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    try {
      return await task();
    } finally {
      // Hand the slot straight to the next task instead of freeing it, so nothing can jump the queue.
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
