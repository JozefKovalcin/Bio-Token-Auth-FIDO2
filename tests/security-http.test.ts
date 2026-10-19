import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createApp } from '../dist/api/app.js';

let app: Awaited<ReturnType<typeof createApp>>;
let base: string;
const origin = 'https://http-boundary.test';
before(async () => {
  if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated _test database required');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.APP_ORIGIN = origin;
  process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  process.env.WEBAUTHN_ENABLED = 'false'; process.env.MODE_C_ENABLED = 'false';
  app = await createApp(); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
});
after(async () => { await app?.close(); });

test('native API refuses browser cookies and does not use forged Origin as authentication', async () => {
  const body = JSON.stringify({ pairingToken: randomBytes(32).toString('base64url') });
  const cookie = await fetch(`${base}/api/mobile/pairings/resolve`, { method: 'POST', headers: { 'content-type': 'application/json', origin, cookie: '__Host-bio_session=browser-cookie' }, body });
  assert.equal(cookie.status, 403);
  const native = await fetch(`${base}/api/mobile/pairings/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  assert.equal(native.status, 503); // It reaches its own fail-closed C gate, never a browser session.
  const forged = await fetch(`${base}/api/mobile/pairings/resolve`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body });
  assert.equal(forged.status, 503);
});

test('browser mutations retain strict Origin and reject duplicate host session cookies', async () => {
  const absent = await fetch(`${base}/api/account/reauth`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"scope":"ENROLL"}' });
  assert.equal(absent.status, 403);
  const duplicate = await fetch(`${base}/api/auth/me`, { headers: { cookie: '__Host-bio_session=one; __Host-bio_session=two' } });
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.headers.get('cache-control'), 'no-store');
});

test('small native and browser endpoints retain bounded JSON request limits', async () => {
  for (const path of ['auth/password', 'mobile/auth/challenge']) {
    const response = await fetch(`${base}/api/${path}`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ payload: 'a'.repeat(9 * 1024) }) });
    assert.equal(response.status, 413);
  }
});

test('malformed JSON never echoes the raw credential body', async () => {
  const response = await fetch(`${base}/api/auth/password`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{"password":"test-only-marker",' });
  assert.equal(response.status, 400);
  assert.equal((await response.text()).includes('test-only-marker'), false);
});
