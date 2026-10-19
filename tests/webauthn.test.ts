import { after, before, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsService } from '@simplewebauthn/server';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { createApp } from '../dist/api/app.js';
import { Database } from '../dist/api/database.js';
import { AuthService } from '../dist/api/auth.service.js';
import { SessionPolicyService } from '../dist/api/session-policy.service.js';
import { WebAuthnService } from '../dist/api/webauthn.service.js';
import { WebAuthnAdapter } from '../dist/api/webauthn-adapter.js';
import { digest, token } from '../dist/api/crypto.js';

// Registration trust is replaced only in orchestration tests. Every assertion below uses
// the real SimpleWebAuthn verifier and freshly generated test EC keys, never physical MFA.
const origin = 'https://bio.test'; const rpId = 'bio.test';
const aaguid = '11111111-2222-3333-4444-555555555555';
const password = 'Local test password 42!';
let app: Awaited<ReturnType<typeof createApp>>; let db: Database; let auth: AuthService;
let policy: SessionPolicyService; let web: WebAuthnService; let adapter: WebAuthnAdapter;
let directory: string; let base: string; const userIds: string[] = [];

before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Dedicated _test database required');
  directory = await mkdtemp(join(tmpdir(), 'bio-webauthn-tests-'));
  const roots = SettingsService.getRootCertificates({ identifier: 'apple' });
  assert.ok(roots.length);
  const rootFile = join(directory, 'test-public-roots.json'); await writeFile(rootFile, JSON.stringify(roots));
  Object.assign(process.env, { DATABASE_URL: url, APP_ORIGIN: origin, TOTP_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    WEBAUTHN_ENABLED: 'true', WEBAUTHN_RP_ID: rpId, WEBAUTHN_AAGUID_ALLOWLIST: aaguid, WEBAUTHN_TRUSTED_ROOTS_FILE: rootFile,
    MODE_C_ENABLED: 'true', MODE_C_HARDWARE_VERIFIED: 'true', ATTESTATION_SERVICE_URL: 'https://attestation.invalid', ATTESTATION_SERVICE_TOKEN: 'test-only' });
  app = await createApp(); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  db = app.get(Database); auth = app.get(AuthService); policy = app.get(SessionPolicyService);
  web = app.get(WebAuthnService); adapter = app.get(WebAuthnAdapter);
});
after(async () => {
  mock.restoreAll();
  if (db) await db.user.deleteMany({ where: { id: { in: userIds } } });
  await app?.close(); if (directory) await rm(directory, { recursive: true, force: true });
});

function keyFixture() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1],
    [-2, Buffer.from(jwk.x!, 'base64url')], [-3, Buffer.from(jwk.y!, 'base64url')]]));
  return { pair, cose, credentialId: token(), counter: 0 };
}
type TestKey = ReturnType<typeof keyFixture>;
function assertion(key: TestKey, challenge: string, userHandle?: string, overrides: {
  origin?: string; rpId?: string; flags?: number; counter?: number; signature?: string; type?: string;
} = {}): AuthenticationResponseJSON {
  const clientData = Buffer.from(JSON.stringify({ type: overrides.type ?? 'webauthn.get', challenge,
    origin: overrides.origin ?? origin, crossOrigin: false }));
  const count = Buffer.alloc(4); count.writeUInt32BE(overrides.counter ?? ++key.counter);
  const authData = Buffer.concat([createHash('sha256').update(overrides.rpId ?? rpId).digest(), Buffer.from([overrides.flags ?? 5]), count]);
  const signature = sign('sha256', Buffer.concat([authData, createHash('sha256').update(clientData).digest()]), key.pair.privateKey);
  return { id: key.credentialId, rawId: key.credentialId, type: 'public-key', clientExtensionResults: {},
    response: { clientDataJSON: clientData.toString('base64url'), authenticatorData: authData.toString('base64url'),
      signature: overrides.signature ?? signature.toString('base64url'), ...(userHandle ? { userHandle } : {}) } };
}
async function fixture() {
  const username = `bc-${randomUUID()}`;
  const registered = await auth.register(username, password, randomUUID());
  const user = await db.user.findUniqueOrThrow({ where: { username } }); userIds.push(user.id);
  return { user, username, raw: registered.sessionToken };
}
async function enroll(f: Awaited<ReturnType<typeof fixture>>, profile: 'B' | 'C' = 'B') {
  const key = keyFixture();
  const grant = await policy.issueGrant(f.raw, 'ENROLL');
  const registration = await web.registrationOptions(f.raw, profile, grant.grant);
  const tx = await db.authTransaction.findUniqueOrThrow({ where: { id: registration.registrationId } });
  const stub = mock.method(adapter, 'registration', async () => ({ fmt: 'packed', aaguid,
    credential: { id: key.credentialId, publicKey: key.cose, counter: 0, transports: ['usb'] },
    credentialType: 'public-key', userVerified: true, credentialDeviceType: 'singleDevice', credentialBackedUp: false,
    origin, rpID: rpId, attestationObject: new Uint8Array() } as const));
  let result;
  try { result = await web.registrationVerify(f.raw, registration.registrationId, {} as RegistrationResponseJSON); }
  finally { stub.mock.restore(); }
  const pending = await web.proofOptions(f.raw, 'ACTIVATE', result.credentialId);
  await web.proofVerify(f.raw, pending.proofId, assertion(key, pending.options.challenge, tx.userHandle!), 'ACTIVATE');
  return { key, credentialId: result.credentialId, handle: tx.userHandle!, registration };
}
async function enableB(f: Awaited<ReturnType<typeof fixture>>) {
  const grant = await policy.issueGrant(f.raw, 'POLICY');
  await web.setPolicy(f.raw, ['B'], grant.grant);
}
async function bAttempt(f: Awaited<ReturnType<typeof fixture>>) {
  const started = await web.bPassword(f.username, password, randomUUID());
  const options = await web.bOptions(started.pendingToken);
  return { ...started, ...options };
}

test('A sessions carry actual evidence and legacy/security-version sessions are rejected', async () => {
  const f = await fixture(); const me = await auth.me(f.raw);
  assert.equal(me.mode, 'A'); assert.deepEqual(me.factors, ['password']);
  const legacy = token(); await db.session.create({ data: { tokenHash: digest(legacy), userId: f.user.id, expiresAt: new Date(Date.now() + 60_000) } });
  await assert.rejects(policy.current(legacy));
  await db.user.update({ where: { id: f.user.id }, data: { securityVersion: { increment: 1 } } });
  await assert.rejects(policy.current(f.raw));
});
test('administratively disabled accounts cannot use sessions, passwords or grants; audits contain no authenticators secrets', async () => {
  const f = await fixture();
  const events = await db.auditEvent.findMany({ where: { userId: f.user.id } });
  assert.equal(events[0]?.event, 'account.registered');
  const serialized = JSON.stringify(events);
  assert.ok(!serialized.includes(password)); assert.ok(!serialized.includes(f.raw));
  await db.user.update({ where: { id: f.user.id }, data: { disabled: true } });
  await assert.rejects(auth.me(f.raw)); await assert.rejects(auth.password(f.username, password, randomUUID()));
  await assert.rejects(policy.issueGrant(f.raw, 'ENROLL'));
});
test('reauth grants are single-use, purpose-bound and browser-bound; stale sessions cannot enroll', async () => {
  const f = await fixture(); const other = await fixture(); const grant = await policy.issueGrant(f.raw, 'ENROLL');
  await assert.rejects(web.registrationOptions(other.raw, 'B', grant.grant));
  await web.registrationOptions(f.raw, 'B', grant.grant);
  await assert.rejects(web.registrationOptions(f.raw, 'B', grant.grant));
  const wrongScope = await policy.issueGrant(f.raw, 'REVOKE');
  await assert.rejects(web.registrationOptions(f.raw, 'B', wrongScope.grant));
  await db.session.update({ where: { tokenHash: digest(f.raw) }, data: { authTime: new Date(0) } });
  await assert.rejects(policy.issueGrant(f.raw, 'ENROLL'));
  const reauth = await auth.reauthenticate(f.raw, 'ENROLL', password);
  assert.equal(reauth.scope, 'ENROLL');
});
test('B is blocked until candidate activation, uses nonresident preference and separate handles for C', async () => {
  const f = await fixture(); const grant = await policy.issueGrant(f.raw, 'POLICY');
  await assert.rejects(web.setPolicy(f.raw, ['B'], grant.grant));
  const b = await enroll(f); const c = await enroll(f, 'C');
  assert.equal(b.registration.options.authenticatorSelection?.residentKey, 'discouraged');
  assert.equal(c.registration.options.authenticatorSelection?.residentKey, 'required');
  assert.ok(!c.registration.options.excludeCredentials?.some(value => value.id === b.key.credentialId));
  const extraGrant = await policy.issueGrant(f.raw, 'ENROLL');
  const anotherB = await web.registrationOptions(f.raw, 'B', extraGrant.grant);
  assert.ok(anotherB.options.excludeCredentials?.some(value => value.id === b.key.credentialId));
  assert.ok(!anotherB.options.excludeCredentials?.some(value => value.id === c.key.credentialId));
  assert.notEqual(b.handle, c.handle);
  assert.equal(b.registration.options.authenticatorSelection?.userVerification, 'required');
  await enableB(f); await assert.rejects(auth.me(f.raw));
  await assert.rejects(auth.password(f.username, password, randomUUID()));
});
test('real signed B assertion creates one evidenced session; replay and TOTP bypass fail', async () => {
  const f = await fixture(); const b = await enroll(f); await enableB(f);
  const attempt = await bAttempt(f);
  await assert.rejects(auth.totp(attempt.pendingToken, '123456'));
  const response = assertion(b.key, attempt.options.challenge, b.handle);
  const result = await web.bVerify(attempt.pendingToken, response);
  assert.equal(result.user.mode, 'B'); assert.deepEqual(result.user.factors, ['password', 'webauthn']);
  await assert.rejects(web.bVerify(attempt.pendingToken, response));
  assert.equal(await db.session.count({ where: { userId: f.user.id } }), 1);
});
test('real verifier rejects wrong origin, RP ID, challenge, type, UP, UV and invalid signature', async () => {
  const f = await fixture(); const b = await enroll(f); await enableB(f);
  const cases = [{ origin: 'https://evil.test' }, { rpId: 'evil.test' }, { flags: 1 }, { flags: 4 },
    { signature: randomBytes(70).toString('base64url') }, { type: 'webauthn.create' }];
  for (const overrides of cases) {
    const attempt = await bAttempt(f);
    await assert.rejects(web.bVerify(attempt.pendingToken, assertion(b.key, attempt.options.challenge, b.handle, overrides)));
  }
  const attempt = await bAttempt(f);
  await assert.rejects(web.bVerify(attempt.pendingToken, assertion(b.key, token(), b.handle)));
  assert.equal(await db.session.count({ where: { userId: f.user.id } }), 0);
});
test('cross-account credential and user-handle substitution are rejected', async () => {
  const a = await fixture(); const b = await fixture(); const ak = await enroll(a); const bk = await enroll(b);
  await enableB(a); await enableB(b);
  const attempt = await bAttempt(a);
  await assert.rejects(web.bVerify(attempt.pendingToken, assertion(bk.key, attempt.options.challenge, bk.handle)));
  await assert.rejects(web.bVerify(attempt.pendingToken, assertion(ak.key, attempt.options.challenge, bk.handle)));
});
test('concurrent completion and concurrent counter updates cannot create duplicate sessions or roll back counters', async () => {
  const f = await fixture(); const b = await enroll(f); await enableB(f);
  const one = await bAttempt(f); const response = assertion(b.key, one.options.challenge, b.handle);
  const results = await Promise.allSettled([web.bVerify(one.pendingToken, response), web.bVerify(one.pendingToken, response)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const first = await bAttempt(f); const second = await bAttempt(f);
  const low = assertion(b.key, first.options.challenge, b.handle); const high = assertion(b.key, second.options.challenge, b.handle);
  await web.bVerify(second.pendingToken, high);
  await assert.rejects(web.bVerify(first.pendingToken, low));
  assert.equal((await db.webAuthnCredential.findUniqueOrThrow({ where: { id: b.credentialId } })).counter, BigInt(b.key.counter));
});
test('expired/revoked credential and policy changes during B prevent completion', async () => {
  const f = await fixture(); const b = await enroll(f); await enableB(f);
  const expired = await bAttempt(f);
  await db.authTransaction.updateMany({ where: { tokenHash: digest(expired.pendingToken) }, data: { expiresAt: new Date(0) } });
  await assert.rejects(web.bVerify(expired.pendingToken, assertion(b.key, expired.options.challenge, b.handle)));
  const changed = await bAttempt(f);
  await db.user.update({ where: { id: f.user.id }, data: { allowedModes: ['C'] } });
  await assert.rejects(web.bVerify(changed.pendingToken, assertion(b.key, changed.options.challenge, b.handle)));
  await db.user.update({ where: { id: f.user.id }, data: { allowedModes: ['B'] } });
  await db.webAuthnCredential.update({ where: { id: b.credentialId }, data: { state: 'REVOKED', version: { increment: 1 } } });
  await assert.rejects(web.bVerify(changed.pendingToken, assertion(b.key, changed.options.challenge, b.handle)));
});
test('C requires a discoverable mapped handle and active trusted phone, then issues only mobile pending', async () => {
  const f = await fixture(); const c = await enroll(f, 'C');
  await db.user.update({ where: { id: f.user.id }, data: { allowedModes: ['A', 'C'] } });
  const started = await web.cOptions(undefined, 'LOGIN', randomUUID());
  assert.ok(!started.options.allowCredentials?.length);
  await assert.rejects(web.cVerify(started.pendingToken, undefined, assertion(c.key, started.options.challenge)));
  await assert.rejects(web.cVerify(started.pendingToken, undefined, assertion(c.key, started.options.challenge, c.handle)));
  await db.mobileDevice.create({ data: { userId: f.user.id, approvalPublicJwk: {}, authPublicJwk: {}, status: 'ACTIVE', trustLevel: 'HARDWARE_ATTESTED' } });
  const result = await web.cVerify(started.pendingToken, undefined, assertion(c.key, started.options.challenge, c.handle));
  assert.equal(result.state, 'PENDING_MOBILE');
  assert.equal(await db.session.count({ where: { userId: f.user.id, mode: 'C' } }), 0);
  const tx = await db.authTransaction.findUniqueOrThrow({ where: { id: result.transactionId } });
  assert.equal(tx.mobileTokenHash, digest(result.capability)); assert.equal(tx.userId, f.user.id);
});
test('actual adapter rejects none/self attestation and HTTP malformed credentials never reach crypto', async () => {
  const none = Buffer.from(isoCBOR.encode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(37)]]))).toString('base64url');
  await assert.rejects(adapter.registration({ response: { response: { attestationObject: none } } as RegistrationResponseJSON,
    expectedChallenge: token(), expectedOrigin: origin, expectedRPID: rpId }));
  const response = await fetch(`${base}/api/auth/b/verify`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ response: { id: 'x' } }) });
  assert.equal(response.status, 400);
});
