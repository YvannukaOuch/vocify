import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStore, type NewClip } from './store.ts';

function clip(overrides: Partial<NewClip>): NewClip {
  return {
    ownerId: 1,
    title: 'Bruh',
    tags: [],
    videoId: 'dQw4w9WgXcQ',
    videoTitle: null,
    startMs: 0,
    endMs: 1000,
    durationMs: 1000,
    fileId: 'file',
    fileUniqueId: 'unique',
    ...overrides,
  };
}

test('clips are private to their owner', () => {
  const store = openStore(':memory:');
  const mine = store.insert(clip({ ownerId: 1 }));
  store.insert(clip({ ownerId: 2, title: 'Someone else' }));

  assert.deepEqual(store.list(1).map((c) => c.id), [mine.id]);
  assert.equal(store.get(2, mine.id), undefined);
  assert.equal(store.remove(2, mine.id), false);
  assert.equal(store.update(2, mine.id, { title: 'hijack' }), undefined);
  assert.equal(store.get(1, mine.id)?.title, 'Bruh');
  store.close();
});

test('search matches every word across title, tags and video title, ignoring case and accents', () => {
  const store = openStore(':memory:');
  const vine = store.insert(clip({ title: 'Vine Boom', tags: ['Bass'], videoTitle: 'Loud sound effect' }));
  const cafe = store.insert(clip({ title: 'Café music', tags: ['chill'] }));

  assert.deepEqual(store.search(1, 'boom', 50, 0).map((c) => c.id), [vine.id]);
  assert.deepEqual(store.search(1, 'BASS loud', 50, 0).map((c) => c.id), [vine.id]);
  assert.deepEqual(store.search(1, 'cafe', 50, 0).map((c) => c.id), [cafe.id]);
  assert.deepEqual(store.search(1, 'boom chill', 50, 0), []);
  assert.equal(store.search(1, '', 50, 0).length, 2);
  store.close();
});

test('recently used clips come first in search; updates refresh the search text', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000 });
  const store = openStore(':memory:');
  const first = store.insert(clip({ title: 'First' }));
  t.mock.timers.tick(1_000);
  const second = store.insert(clip({ title: 'Second' }));
  t.mock.timers.tick(1_000);
  store.markUsed(1, first.id);

  assert.equal(store.search(1, '', 50, 0)[0]!.id, first.id);
  assert.equal(store.get(1, first.id)?.useCount, 1);

  store.update(1, second.id, { title: 'Renamed', tags: ['airhorn'] });
  assert.deepEqual(store.search(1, 'airhorn', 50, 0).map((c) => c.id), [second.id]);
  assert.deepEqual(store.get(1, second.id)?.tags, ['airhorn']);
  store.close();
});
