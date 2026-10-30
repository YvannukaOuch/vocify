import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseClipRequest, parseTime, parseVideoId, urlStartTime } from './youtube.ts';

test('parseVideoId understands common link shapes', () => {
  const id = 'dQw4w9WgXcQ';
  for (const input of [
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?feature=share&v=${id}&t=43`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abc123&t=12`,
    `youtu.be/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}?start=5`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ]) {
    assert.equal(parseVideoId(input), id, input);
  }
});

test('parseVideoId rejects non-YouTube or malformed input', () => {
  for (const input of ['', 'hello world', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/short', 'https://www.youtube.com/@channel']) {
    assert.equal(parseVideoId(input), null, input);
  }
});

test('parseTime', () => {
  assert.equal(parseTime('83.5'), 83.5);
  assert.equal(parseTime('1:23.5'), 83.5);
  assert.equal(parseTime('1,5'), 1.5);
  assert.equal(parseTime('1:02:03'), 3723);
  assert.equal(parseTime('1:2:3:4'), null);
  assert.equal(parseTime('1.5:20'), null);
  assert.equal(parseTime('abc'), null);
});

test('urlStartTime', () => {
  assert.equal(urlStartTime('https://youtu.be/dQw4w9WgXcQ?t=43'), 43);
  assert.equal(urlStartTime('https://youtu.be/dQw4w9WgXcQ?t=1m30s'), 90);
  assert.equal(urlStartTime('https://youtu.be/dQw4w9WgXcQ?t=1h2m3s'), 3723);
  assert.equal(urlStartTime('https://www.youtube.com/embed/dQw4w9WgXcQ?start=5'), 5);
  assert.equal(urlStartTime('https://youtu.be/dQw4w9WgXcQ'), null);
});

test('parseClipRequest pulls out link, range and name', () => {
  assert.deepEqual(parseClipRequest('https://youtu.be/dQw4w9WgXcQ 0:43-0:47 never gonna'), {
    videoId: 'dQw4w9WgXcQ', startSec: 43, endSec: 47, title: 'never gonna',
  });
  assert.deepEqual(parseClipRequest('bruh https://www.youtube.com/watch?v=dQw4w9WgXcQ 1:02.5 to 1:04'), {
    videoId: 'dQw4w9WgXcQ', startSec: 62.5, endSec: 64, title: 'bruh',
  });
  // IDs containing dashes must not be mistaken for a time range.
  assert.deepEqual(parseClipRequest('https://youtu.be/a-1-2-3-4-5'), {
    videoId: 'a-1-2-3-4-5', startSec: null, endSec: null, title: null,
  });
  assert.deepEqual(parseClipRequest('https://youtu.be/dQw4w9WgXcQ?t=90'), {
    videoId: 'dQw4w9WgXcQ', startSec: 90, endSec: null, title: null,
  });
  assert.equal(parseClipRequest('no link here 0:01-0:02'), null);
});
