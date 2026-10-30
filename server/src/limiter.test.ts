import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UserError } from './errors.ts';
import { createLimiter } from './limiter.ts';

test('never runs more tasks than allowed and rejects when the queue is full', async () => {
  const limit = createLimiter(2, 2);
  let running = 0;
  let peak = 0;
  const task = () =>
    limit(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running--;
    });

  const accepted = [task(), task(), task(), task()];
  await assert.rejects(task(), (error: unknown) => error instanceof UserError && error.code === 'busy');
  await Promise.all(accepted);
  assert.equal(peak, 2);

  // Slots are released afterwards.
  await task();
  assert.equal(running, 0);
});
