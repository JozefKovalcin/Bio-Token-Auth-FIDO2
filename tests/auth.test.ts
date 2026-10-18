import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { generate } from 'otplib';
import { createApp } from '../dist/api/app.js';
import { Database } from '../dist/api/database.js';
import { AuthService } from '../dist/api/auth.service.js';
import { decrypt, digest, encrypt } from '../dist/api/crypto.js';

const origin = 'https://bio.test';
const password = 'Local test password 42!';
let app: Awaited<ReturnType<typeof createApp>>;
let db: Database;
let auth: AuthService;
let base: string;
const users: string[] = [];
const ips: string[] = [];

before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Set TEST_DATABASE_URL to a dedicated database ending in _test; apply migrations first.');
  process.env.DATABASE_URL = url;
  process.env.APP_ORIGIN = origin;
  process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  app = await createApp(); await app.listen(0, '127.0.0.1');
  base = await app.getUrl(); db = app.get(Database); auth = app.get(AuthService);
});
after(async () => {
  if (db) {
    await db.user.deleteMany({ where: { username: { in: users } } });
    const keys = users.flatMap(name => [`password-account:${name}`, `register-account:${name}`]).concat(ips.flatMap(ip => [`password-ip:${ip}`, `register-ip:${ip}`]));
    await db.rateLimit.deleteMany({ where: { key: { in: keys.map(digest) } } });
  }
  await app?.close();
});

async function fixture(active = true, precreate = true) {
  const username = `test-${randomUUID()}`; users.push(username);
  let user = precreate ? await auth.createUser(username, password) : undefined;
  if (active && user) await db.user.update({ where: { id: user.id }, data: { totpActive: true } });
  const ip = `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`; ips.push(ip);
  let secret = user ? decrypt(user.totpEncrypted, user.id) : '';
  let cookie = '';
  async function request(path: string, body?: object, requestOrigin: string | null = origin) {
    const headers: Record<string, string> = { 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) };
    if (requestOrigin !== null) headers.origin = requestOrigin;
    if (body) headers['content-type'] = 'application/json';
    const res = await fetch(`${base}/api/auth/${path}`, { headers, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    for (const value of res.headers.getSetCookie()) {
      const [pair] = value.split(';'); const [key] = pair.split('=');
      const jar = new Map(cookie.split('; ').filter(Boolean).map(s => [s.split('=')[0], s]));
      jar.set(key, pair); cookie = [...jar.values()].join('; ');
    }
    return res;
  }
  const login = () => request('password', { username, password });
  const otp = (epoch = Math.floor(Date.now() / 1000)) => generate({ secret, epoch });
  async function wrongCode() {
    const now = Math.floor(Date.now() / 1000);
    const valid = await Promise.all([-30, 0, 30].map(delta => otp(now + delta)));
    return ['000000', '111111', '222222', '333333'].find(code => !valid.includes(code))!;
  }
  return { get user() { if (!user) throw new Error('Fixture user has not been created.'); return user; }, setUser(value: NonNullable<typeof user>) { user = value; secret = decrypt(value.totpEncrypted, value.id); }, username, get secret() { return secret; }, request, login, otp, wrongCode, getCookie: () => cookie, setCookie: (value: string) => { cookie = value; } };
}

test('HTTPS origin and 32-byte encryption key are mandatory', async () => {
  const original = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = 'http://bio.test';
  await assert.rejects(createApp()); process.env.APP_ORIGIN = original;
});
test('encrypted TOTP is authenticated and bound to its account', () => {
  const value = encrypt('secret-value', 'account-a');
  assert.equal(decrypt(value, 'account-a'), 'secret-value');
  assert.throws(() => decrypt(value, 'account-b'));
  const bytes = Buffer.from(value, 'base64'); bytes[20] ^= 1;
  assert.throws(() => decrypt(bytes.toString('base64'), 'account-a'));
});
test('registration creates a session; TOTP can be enrolled now and protects later logins', async () => {
  const f = await fixture(false, false);
  const first = await f.request('register', { username: f.username, password }); assert.equal(first.status, 201);
  f.setUser(await db.user.findUniqueOrThrow({ where: { username: f.username } }));
  assert.match(first.headers.get('set-cookie')!, /Secure/);
  assert.match(first.headers.get('set-cookie')!, /HttpOnly/);
  assert.match(first.headers.get('set-cookie')!, /SameSite=Strict/);
  assert.equal((await first.json()).totpActive, false);
  assert.equal((await f.request('me')).status, 200);
  const enrollment = await f.request('enrollment');
  assert.equal(enrollment.headers.get('cache-control'), 'no-store');
  const setup = await enrollment.json(); assert.equal(setup.secret, f.secret);
  assert.match(setup.qr, /^data:image\/png;base64,/);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).totpActive, false);
  assert.equal((await f.request('totp/activate', { code: await f.wrongCode() })).status, 401);
  assert.equal((await f.request('totp/activate', { code: await f.otp() })).status, 201);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).totpActive, true);
  const me = await f.request('me'); assert.equal(me.status, 200); assert.equal((await me.json()).totpActive, true);
  assert.equal((await f.request('enrollment')).status, 409);
  await f.request('logout', {});
  const login = await f.login(); assert.equal(login.status, 201); assert.equal((await login.json()).step, 'totp');
  assert.equal((await f.request('me')).status, 401);
  assert.equal((await f.request('totp', { code: await f.otp(Math.floor(Date.now() / 1000) + 30) })).status, 201);
});
test('registration validates password length and rejects duplicate usernames', async () => {
  const f = await fixture(false, false);
  assert.equal((await f.request('register', { username: `short-${randomUUID()}`, password: 'too-short' })).status, 400);
  assert.equal((await f.request('register', { username: f.username, password })).status, 201);
  await f.request('logout', {});
  assert.equal((await f.login()).status, 201);
  assert.equal((await f.request('me')).status, 200);
  assert.equal((await f.request('register', { username: f.username, password })).status, 409);
});
test('wrong passwords and unknown users are rejected without pending cookies', async () => {
  const f = await fixture();
  for (const username of [f.username, `missing-${randomUUID()}`]) {
    const res = await f.request('password', { username, password: 'wrong password' });
    assert.equal(res.status, 401); assert.equal(res.headers.get('set-cookie'), null);
  }
});
test('missing or foreign Origin is rejected before authentication', async () => {
  const f = await fixture();
  for (const value of [null, 'https://evil.test']) assert.equal((await f.request('password', { username: f.username, password }, value)).status, 403);
});
test('malformed input and OTP without pending session cannot bypass factors', async () => {
  const f = await fixture();
  assert.equal((await f.request('password', { username: {}, password })).status, 400);
  assert.equal((await f.request('totp', { code: '123456' })).status, 401);
  await f.login();
  assert.equal((await f.request('totp', { code: '1e5' })).status, 400);
  assert.equal((await f.request('me')).status, 401);
});
test('five wrong codes consume the pending attempt budget', async () => {
  const f = await fixture(); await f.login(); const code = await f.wrongCode();
  for (let i = 0; i < 5; i++) assert.equal((await f.request('totp', { code })).status, 401);
  assert.equal((await f.request('totp', { code: await f.otp() })).status, 401);
  assert.equal((await f.request('me')).status, 401);
});
test('expired and cancelled pending sessions are rejected', async () => {
  const f = await fixture(); await f.login();
  await db.pending.updateMany({ where: { userId: f.user.id }, data: { expiresAt: new Date(0) } });
  assert.equal((await f.request('totp', { code: await f.otp() })).status, 401);
  await f.login(); const previous = f.getCookie(); await f.request('logout', {}); f.setCookie(previous);
  assert.equal((await f.request('totp', { code: await f.otp() })).status, 401);
});
test('TOTP timestep cannot be replayed in a new transaction', async () => {
  const f = await fixture(); await f.login(); const code = await f.otp();
  assert.equal((await f.request('totp', { code })).status, 201);
  await f.request('logout', {}); await f.login();
  assert.equal((await f.request('totp', { code })).status, 401);
});
test('concurrent completion of one transaction creates exactly one session', async () => {
  const f = await fixture(); await f.login(); const code = await f.otp();
  const results = await Promise.all([f.request('totp', { code }), f.request('totp', { code })]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 401]);
  assert.equal(await db.session.count({ where: { userId: f.user.id } }), 1);
});
test('the same OTP across two pending transactions also succeeds only once', async () => {
  const f = await fixture(); await f.login(); const firstCookie = f.getCookie();
  f.setCookie(''); await f.login(); const secondCookie = f.getCookie(); const code = await f.otp();
  const send = (cookie: string) => fetch(`${base}/api/auth/totp`, { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
  const results = await Promise.all([send(firstCookie), send(secondCookie)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 401]);
});
test('account-bound OTP cannot authenticate a different account', async () => {
  const a = await fixture(); const b = await fixture(); await b.login();
  let code = await a.otp();
  if (code === await b.otp()) code = await b.wrongCode();
  assert.equal((await b.request('totp', { code })).status, 401);
});
test('server policy blocks A at password, completion and existing-session checks', async () => {
  const f = await fixture(); await f.login();
  await db.user.update({ where: { id: f.user.id }, data: { allowedModes: ['C'] } });
  assert.equal((await f.request('totp', { code: await f.otp() })).status, 401);
  assert.equal((await f.login()).status, 401);
  await db.user.update({ where: { id: f.user.id }, data: { allowedModes: ['A'] } });
  assert.equal((await f.request('totp', { code: await f.otp() })).status, 201);
  await db.user.update({ where: { id: f.user.id }, data: { allowedModes: ['C'] } });
  assert.equal((await f.request('me')).status, 401);
});
test('session token rotates, logout invalidates it, expired sessions fail', async () => {
  const f = await fixture(); await f.login();
  const pending = f.getCookie(); await f.request('totp', { code: await f.otp() });
  const session = f.getCookie(); assert.notEqual(session, pending);
  await f.request('logout', {}); f.setCookie(session);
  assert.equal((await f.request('me')).status, 401);
  const raw = randomBytes(32).toString('base64url');
  await db.session.create({ data: { tokenHash: digest(raw), userId: f.user.id, expiresAt: new Date(0) } });
  f.setCookie(`__Host-bio_session=${raw}`);
  assert.equal((await f.request('me')).status, 401);
});
test('account password attempts are limited across separate transactions', async () => {
  const f = await fixture();
  for (let i = 0; i < 10; i++) assert.equal((await f.request('password', { username: f.username, password: 'wrong' })).status, 401);
  assert.equal((await f.login()).status, 429);
});
test('account TOTP throttle survives issuing a new pending cookie', async () => {
  const f = await fixture(); const code = await f.wrongCode();
  for (let round = 0; round < 2; round++) { await f.login(); for (let i = 0; i < 5; i++) assert.equal((await f.request('totp', { code })).status, 401); }
  await f.login(); assert.equal((await f.request('totp', { code: await f.otp() })).status, 429);
});
test('a stale OTP and a forged pending token cannot complete authentication', async () => {
  const f = await fixture(); await f.login();
  assert.equal((await f.request('totp', { code: await f.otp(Math.floor(Date.now() / 1000) - 120) })).status, 401);
  f.setCookie(`__Host-bio_pending=${randomBytes(32).toString('base64url')}`);
  assert.equal((await f.request('totp', { code: await f.otp() })).status, 401);
});
test('a second full login revokes the previous full session token', async () => {
  const f = await fixture(); await f.login();
  assert.equal((await f.request('totp', { code: await f.otp() })).status, 201);
  const previous = f.getCookie(); await f.login();
  assert.equal((await f.request('totp', { code: await f.otp(Math.floor(Date.now() / 1000) + 30) })).status, 201);
  assert.equal((await f.request('me')).status, 200);
  f.setCookie(previous); assert.equal((await f.request('me')).status, 401);
  assert.equal(await db.session.count({ where: { userId: f.user.id } }), 1);
});
