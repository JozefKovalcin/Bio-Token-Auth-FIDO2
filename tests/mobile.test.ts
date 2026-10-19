import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { Database } from '../dist/api/database.js';
import { AuthService } from '../dist/api/auth.service.js';
import { SessionPolicyService } from '../dist/api/session-policy.service.js';
import { MobileService } from '../dist/api/mobile.service.js';
import { MobileAttestationVerifier } from '../dist/api/mobile.attestation.js';
import { mobileSigningInput, verifyMobileJws } from '../dist/api/mobile.crypto.js';
import { digest, token } from '../dist/api/crypto.js';

// Protocol/DB fixtures deliberately simulate trusted hardware. They do NOT prove Android MFA.
class FixtureAttestation extends MobileAttestationVerifier {
  revoked = false;
  override enabled() { return true; }
  override async verify() { return { trustLevel: 'HARDWARE_ATTESTED' as const, evidence: { verifier: 'TEST-ONLY' } }; }
  override async checkTrust() { if (this.revoked) throw new Error('TEST-ONLY certificate revocation'); }
}
let db: Database;
let policy: SessionPolicyService;
let mobile: MobileService;
const users: string[] = [];
const fixtureAttestation = new FixtureAttestation();

before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('A dedicated TEST_DATABASE_URL ending in _test is required.');
  process.env.DATABASE_URL = url;
  process.env.APP_ORIGIN = 'https://bio.test';
  process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  db = new Database(); await db.$connect();
  policy = new SessionPolicyService(db);
  mobile = new MobileService(db, policy, new AuthService(db, policy), fixtureAttestation);
});
after(async () => {
  if (db) { await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect(); }
});

function key() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const publicJwk = { kty: 'EC' as const, crv: 'P-256' as const, x: jwk.x!, y: jwk.y! };
  return { publicJwk, proof: (input: string) => `${input}.${sign('sha256', Buffer.from(input), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}` };
}

async function fixture() {
  const user = await db.user.create({ data: { id: randomUUID(), username: `mobile-${randomUUID()}`, passwordHash: 'TEST-ONLY', totpEncrypted: 'TEST-ONLY', allowedModes: ['A', 'C'] } }); users.push(user.id);
  const sessionToken = token();
  await db.session.create({ data: { tokenHash: digest(sessionToken), ...policy.sessionData(user, 'A', ['password']) } });
  const credential = await db.webAuthnCredential.create({ data: { credentialId: token(), userId: user.id, userHandle: token(), profile: 'C', publicKey: Buffer.from('TEST-ONLY'), state: 'ACTIVE', rpId: 'bio.test', aaguid: randomUUID(), transports: ['usb'], deviceType: 'singleDevice', attestationVerified: true } });
  const approval = key(); const auth = key();
  const device = await db.mobileDevice.create({ data: { userId: user.id, approvalPublicJwk: approval.publicJwk, authPublicJwk: auth.publicJwk, status: 'ACTIVE', trustLevel: 'HARDWARE_ATTESTED' } });
  const start = async (purpose = 'LOGIN') => {
    const pendingToken = token(); const capability = token();
    const transaction = await db.authTransaction.create({ data: { tokenHash: digest(pendingToken), mobileTokenHash: digest(capability),
      userId: user.id, mode: 'C', purpose, state: 'PENDING_MOBILE', credentialId: credential.id, securityVersion: user.securityVersion,
      expiresAt: new Date(Date.now() + 120_000), webauthnVerifiedAt: new Date(), mobileChallenge: token(),
      ...(purpose === 'C_ACTIVATION' ? { sourceSessionHash: digest(sessionToken) } : {}) } });
    return { transaction, pendingToken, capability };
  };
  const resolve = async (capability: string) => {
    const challenge = await mobile.authChallenge(device.id, capability, 'resolve', `test-${user.id}`);
    return mobile.resolve(challenge.challengeId, auth.proof(challenge.signingInput));
  };
  const approved = async () => {
    const flow = await start(); const approvalChallenge = await resolve(flow.capability);
    await mobile.decide(approvalChallenge.challengeId, approval.proof(approvalChallenge.signingInput), true);
    return flow;
  };
  return { user, credential, device, sessionToken, approval, auth, start, resolve, approved };
}

test('mobile JWS is ES256 over exact server input and refuses a substituted key or payload', async () => {
  const owner = key(); const attacker = key();
  const input = mobileSigningInput('LOGIN_APPROVE', new Date(Date.now() + 60_000), { accountId: 'test-account' });
  await verifyMobileJws(owner.proof(input), input, owner.publicJwk);
  await assert.rejects(verifyMobileJws(attacker.proof(input), input, owner.publicJwk));
  await assert.rejects(verifyMobileJws(owner.proof(input), `${input}x`, owner.publicJwk));
});

test('production attestation stays disabled without every explicit hardware trust gate', () => {
  const names = ['MODE_C_ENABLED', 'MODE_C_HARDWARE_VERIFIED', 'ATTESTATION_SERVICE_URL', 'ATTESTATION_SERVICE_TOKEN'];
  const previous = names.map(name => process.env[name]);
  try {
    names.forEach(name => delete process.env[name]);
    process.env.MODE_C_ENABLED = 'true';
    assert.throws(() => new MobileAttestationVerifier().assertEnabled());
  } finally { names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; }); }
});

test('C protocol fixture requires both signatures and issues session only in the original browser', async () => {
  const f = await fixture(); const flow = await f.start();
  assert.equal(await db.session.count({ where: { sourceTransactionId: flow.transaction.id } }), 0);
  const resolveChallenge = await mobile.authChallenge(f.device.id, flow.capability, 'resolve', 'full-flow');
  await assert.rejects(mobile.resolve(resolveChallenge.challengeId, f.approval.proof(resolveChallenge.signingInput)));
  const approval = await mobile.resolve(resolveChallenge.challengeId, f.auth.proof(resolveChallenge.signingInput));
  await assert.rejects(mobile.resolve(resolveChallenge.challengeId, f.auth.proof(resolveChallenge.signingInput)));
  await assert.rejects(mobile.decide(approval.challengeId, f.auth.proof(approval.signingInput), true));
  const result = await mobile.decide(approval.challengeId, f.approval.proof(approval.signingInput), true);
  assert.deepEqual(result, { status: 'APPROVED' });
  assert.equal('sessionToken' in result, false);
  await assert.rejects(mobile.complete(token()));
  const completed = await mobile.complete(flow.pendingToken);
  assert.equal('sessionToken' in completed, true);
  assert.equal(await db.session.count({ where: { sourceTransactionId: flow.transaction.id } }), 1);
  await assert.rejects(mobile.complete(flow.pendingToken));
});

test('a phone from another account cannot resolve a transaction and proofs cannot cross transactions', async () => {
  const a = await fixture(); const b = await fixture(); const flow = await a.start();
  await assert.rejects(mobile.authChallenge(b.device.id, flow.capability, 'resolve', 'foreign-account'));
  const first = await a.resolve(flow.capability); const nextFlow = await a.start(); const next = await a.resolve(nextFlow.capability);
  await assert.rejects(mobile.decide(next.challengeId, a.approval.proof(first.signingInput), true));
});

test('approval and rejection proofs are purpose separated', async () => {
  const f = await fixture(); const flow = await f.start();
  const challenge = await mobile.authChallenge(f.device.id, flow.capability, 'reject', 'reject');
  await assert.rejects(mobile.resolve(challenge.challengeId, f.auth.proof(challenge.signingInput)));
  await assert.rejects(mobile.decide(challenge.challengeId, f.auth.proof(challenge.signingInput), true));
  await mobile.decide(challenge.challengeId, f.auth.proof(challenge.signingInput), false);
  await assert.rejects(mobile.complete(flow.pendingToken));
});

test('concurrent C completion creates exactly one session', async () => {
  const f = await fixture(); const flow = await f.approved();
  const result = await Promise.allSettled([mobile.complete(flow.pendingToken), mobile.complete(flow.pendingToken)]);
  assert.equal(result.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(await db.session.count({ where: { sourceTransactionId: flow.transaction.id } }), 1);
});

test('concurrent approve and reject has only one terminal decision', async () => {
  const f = await fixture(); const flow = await f.start(); const approve = await f.resolve(flow.capability);
  const reject = await mobile.authChallenge(f.device.id, flow.capability, 'reject', 'race');
  const result = await Promise.allSettled([
    mobile.decide(approve.challengeId, f.approval.proof(approve.signingInput), true),
    mobile.decide(reject.challengeId, f.auth.proof(reject.signingInput), false),
  ]);
  assert.equal(result.filter(value => value.status === 'fulfilled').length, 1);
});

test('expiry, policy change and revoked device are rechecked at approval and browser completion', async () => {
  const f = await fixture(); const flow = await f.start(); const approval = await f.resolve(flow.capability);
  await db.authTransaction.update({ where: { id: flow.transaction.id }, data: { expiresAt: new Date(0) } });
  await assert.rejects(mobile.decide(approval.challengeId, f.approval.proof(approval.signingInput), true));
  const approved = await f.approved();
  await db.user.update({ where: { id: f.user.id }, data: { securityVersion: { increment: 1 } } });
  await assert.rejects(mobile.complete(approved.pendingToken));
  const g = await fixture(); const revoked = await g.approved();
  await db.mobileDevice.update({ where: { id: g.device.id }, data: { status: 'REVOKED', version: { increment: 1 } } });
  await assert.rejects(mobile.complete(revoked.pendingToken));
});

test('revocation racing completion never leaves a usable C session', async () => {
  const f = await fixture(); const flow = await f.approved();
  const backupA = key(); const backupB = key();
  await db.mobileDevice.create({ data: { userId: f.user.id, approvalPublicJwk: backupA.publicJwk, authPublicJwk: backupB.publicJwk, status: 'ACTIVE', trustLevel: 'HARDWARE_ATTESTED' } });
  const cSession = token();
  await db.session.create({ data: { tokenHash: digest(cSession), ...policy.sessionData(f.user, 'C', ['webauthn', 'mobile'], { credentialId: f.credential.id, deviceId: f.device.id }) } });
  const grant = await policy.issueGrant(cSession, 'REVOKE');
  const results = await Promise.allSettled([mobile.complete(flow.pendingToken), mobile.revoke(cSession, f.device.id, grant.grant)]);
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(await db.session.count({ where: { userId: f.user.id } }), 0);
  assert.equal((await db.mobileDevice.findUniqueOrThrow({ where: { id: f.device.id } })).status, 'REVOKED');
});

test('C activation trial produces only an account/session-bound proof, never a login session', async () => {
  const f = await fixture(); await db.user.update({ where: { id: f.user.id }, data: { allowedModes: ['A'] } });
  const flow = await f.start('C_ACTIVATION'); const approval = await f.resolve(flow.capability);
  await mobile.decide(approval.challengeId, f.approval.proof(approval.signingInput), true);
  assert.deepEqual(await mobile.complete(flow.pendingToken), { activationProofId: flow.transaction.id, verified: true });
  assert.equal(await db.session.count({ where: { sourceTransactionId: flow.transaction.id } }), 0);
});

test('pairing is staged, key-bound, original-browser confirmed and rejects stolen candidate replacement', async () => {
  const f = await fixture(); await db.user.update({ where: { id: f.user.id }, data: { allowedModes: ['A'] } });
  const grant = await policy.issueGrant(f.sessionToken, 'ENROLL');
  const proof = await db.authTransaction.create({ data: { tokenHash: digest(token()), userId: f.user.id, mode: 'C', purpose: 'PAIRING', state: 'VERIFIED_YUBIKEY', credentialId: f.credential.id,
    sourceSessionHash: digest(f.sessionToken), securityVersion: 1, webauthnVerifiedAt: new Date(), expiresAt: new Date(Date.now() + 120_000) } });
  const pairing = await mobile.startPairing(f.sessionToken, proof.id, grant.grant);
  const newApproval = key(); const newAuth = key();
  const body = { label: 'TEST-ONLY phone', approvalPublicJwk: newApproval.publicJwk, authPublicJwk: newAuth.publicJwk, approvalAttestation: ['TEST-ONLY'], authAttestation: ['TEST-ONLY'] };
  const candidate = await mobile.candidate(pairing.pairingToken, body, 'pairing-test');
  assert.equal((await db.mobileDevice.findUniqueOrThrow({ where: { id: candidate.deviceId } })).status, 'CANDIDATE');
  await assert.rejects(mobile.candidate(pairing.pairingToken, body, 'pairing-test'));
  await assert.rejects(mobile.confirmPairing(f.sessionToken, pairing.pairingId, candidate.deviceId, candidate.confirmationCode));
  await mobile.provePairing(pairing.pairingToken, candidate.challengeId, newApproval.proof(candidate.signingInput), newAuth.proof(candidate.signingInput));
  await assert.rejects(mobile.provePairing(pairing.pairingToken, candidate.challengeId, newApproval.proof(candidate.signingInput), newAuth.proof(candidate.signingInput)));
  await assert.rejects(mobile.confirmPairing(token(), pairing.pairingId, candidate.deviceId, candidate.confirmationCode));
  await assert.rejects(mobile.confirmPairing(f.sessionToken, pairing.pairingId, f.device.id, candidate.confirmationCode));
  await mobile.confirmPairing(f.sessionToken, pairing.pairingId, candidate.deviceId, candidate.confirmationCode);
  assert.equal((await db.mobileDevice.findUniqueOrThrow({ where: { id: candidate.deviceId } })).status, 'ACTIVE');
  await assert.rejects(mobile.startPairing(f.sessionToken, proof.id, grant.grant));
});

test('the old tab cannot inspect or consume a replacement browser transaction', async () => {
  const f = await fixture(); const old = await f.start(); const current = await f.approved();
  await assert.rejects(mobile.status(current.pendingToken, old.transaction.id));
  await assert.rejects(mobile.complete(current.pendingToken, undefined, old.transaction.id));
  await assert.rejects(mobile.cancel(current.pendingToken, old.transaction.id));
  assert.equal((await mobile.status(current.pendingToken, current.transaction.id)).state, 'APPROVED');
});

test('changed certificate trust blocks both mobile approval and browser completion', async () => {
  const f = await fixture(); const flow = await f.start(); const approve = await f.resolve(flow.capability);
  const completedApproval = await f.approved();
  fixtureAttestation.revoked = true;
  try {
    await assert.rejects(mobile.decide(approve.challengeId, f.approval.proof(approve.signingInput), true));
    await assert.rejects(mobile.complete(completedApproval.pendingToken));
    assert.equal(await db.session.count({ where: { sourceTransactionId: completedApproval.transaction.id } }), 0);
  } finally { fixtureAttestation.revoked = false; }
});
