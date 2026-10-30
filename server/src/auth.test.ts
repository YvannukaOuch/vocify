import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { validateInitData } from './auth.ts';

const TOKEN = '123456:TEST-token';

/** Builds initData exactly the way Telegram signs it. */
function sign(fields: Record<string, string>, token = TOKEN): string {
  const dataCheckString = Object.keys(fields).sort().map((key) => `${key}=${fields[key]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const now = Date.UTC(2026, 9, 28);
const fields = {
  auth_date: String(now / 1000 - 60),
  query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
  user: JSON.stringify({ id: 42, first_name: 'Ada', username: 'ada' }),
  signature: 'ignored-by-hmac-check',
};

test('accepts correctly signed data', () => {
  assert.deepEqual(validateInitData(sign(fields), TOKEN, now), { id: 42, first_name: 'Ada', username: 'ada' });
});

test('rejects data signed with another token', () => {
  assert.equal(validateInitData(sign(fields, '999:other'), TOKEN, now), null);
});

test('rejects tampered data', () => {
  const tampered = sign(fields).replace('%22id%22%3A42', '%22id%22%3A43');
  assert.equal(validateInitData(tampered, TOKEN, now), null);
});

test('rejects stale data', () => {
  const old = sign({ ...fields, auth_date: String(now / 1000 - 2 * 24 * 60 * 60) });
  assert.equal(validateInitData(old, TOKEN, now), null);
});

test('rejects missing hash or empty input', () => {
  assert.equal(validateInitData('', TOKEN, now), null);
  assert.equal(validateInitData(new URLSearchParams(fields).toString(), TOKEN, now), null);
});
