import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException } from '@nestjs/common';
import { MobileAttestationVerifier, type MobileAttestationInput } from '../dist/api/mobile.attestation.js';

// These fixtures exercise the internal HTTP boundary, never a successful physical attestation.
const version = 'android/keyattestation@621149c4ebaeeea844d6f43098687c73c4d370a3';
const marker = 'SECRET_TEST_MARKER_MUST_NOT_BE_EXPOSED';
const settings = {
  MODE_C_ENABLED: 'true', MODE_C_HARDWARE_VERIFIED: 'true',
  ATTESTATION_SERVICE_URL: 'http://attestation:8081', ATTESTATION_SERVICE_TOKEN: 'TEST-ONLY-internal-service-token-not-a-real-secret',
};
const original = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
beforeEach(() => Object.assign(process.env, settings));
afterEach(() => {
  mock.restoreAll();
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

const input: MobileAttestationInput = {
  challenge: 'A'.repeat(43),
  approvalPublicJwk: { kty: 'EC', crv: 'P-256', x: 'A'.repeat(43), y: 'B'.repeat(43) },
  authPublicJwk: { kty: 'EC', crv: 'P-256', x: 'C'.repeat(43), y: 'D'.repeat(43) },
  approvalAttestation: ['AQ==', 'Ag=='], authAttestation: ['Aw==', 'Ag=='],
};
const evidence = {
  verifier: version, certificateSerials: 'abc,def,123',
  approvalSecurityLevel: 'TRUSTED_ENVIRONMENT', authSecurityLevel: 'STRONG_BOX',
  verifiedBoot: true, applicationVerified: true, biometricPerUse: true, verifiedAt: '2026-11-02T10:00:00.123456789Z',
};
const verified = (value: unknown = evidence) => ({ verified: true, trustLevel: 'HARDWARE_ATTESTED', evidence: value });
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

async function unauthorized(work: Promise<unknown>) {
  await assert.rejects(work, (error: unknown) => {
    assert.ok(error instanceof UnauthorizedException);
    assert.equal(error.getStatus(), 401);
    assert.ok(!JSON.stringify(error.getResponse()).includes(marker));
    assert.ok(!JSON.stringify(error).includes(marker));
    return true;
  });
}

function streamed(chunks: Uint8Array[], headers?: HeadersInit) {
  let reads = 0; let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[reads++];
      if (chunk) controller.enqueue(chunk); else controller.close();
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  return { response: new Response(body, { headers }), reads: () => reads, cancelled: () => cancelled };
}

test('attestation bridge accepts actual JVM evidence and forwards only its trust identity', async () => {
  const requests: { url: string; body: unknown }[] = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(String(options?.body)) });
    return String(url).endsWith('/verify') ? json(verified({ ...evidence, ignoredField: marker })) : json({ trusted: true });
  });
  const verifier = new MobileAttestationVerifier();
  const result = await verifier.verify(input);
  assert.deepEqual(result, { trustLevel: 'HARDWARE_ATTESTED', evidence });
  await verifier.checkTrust(result.evidence, true);
  assert.deepEqual(requests.map(request => request.url), ['http://attestation:8081/verify', 'http://attestation:8081/trust-status']);
  assert.deepEqual(requests[1].body, { evidence: { verifier: version, certificateSerials: evidence.certificateSerials } });
});

test('attestation bridge rejects incomplete, software or malformed evidence before accepting enrollment', async () => {
  let body: unknown;
  mock.method(globalThis, 'fetch', async () => json(body));
  for (const value of [
    null, {}, [], 'invalid',
    { ...evidence, verifier: marker }, { ...evidence, certificateSerials: 'abc' },
    { ...evidence, certificateSerials: 'abc,DEF' }, { ...evidence, certificateSerials: ['abc', 'def'] },
    { ...evidence, certificateSerials: `abc,${'a'.repeat(257)}` },
    { ...evidence, certificateSerials: Array(17).fill('abc').join(',') },
    { ...evidence, approvalSecurityLevel: 'SOFTWARE' }, { ...evidence, authSecurityLevel: null },
    { ...evidence, verifiedBoot: false }, { ...evidence, applicationVerified: 'true' },
    { ...evidence, biometricPerUse: false }, { ...evidence, verifiedAt: 'invalid' },
  ]) {
    body = verified(value);
    await unauthorized(new MobileAttestationVerifier().verify(input));
  }
  for (const value of [null, [], { ...verified(), verified: 'true' }, { ...verified(), trustLevel: 'SOFTWARE' }]) {
    body = value;
    await unauthorized(new MobileAttestationVerifier().verify(input));
  }
});

test('enrollment response byte limit cancels oversized chunked bodies without consuming the tail', async () => {
  const first = new Uint8Array(4096).fill(32);
  const oversized = streamed([first, first, new Uint8Array([32]), new TextEncoder().encode(marker)]);
  mock.method(globalThis, 'fetch', async () => oversized.response);
  await unauthorized(new MobileAttestationVerifier().verify(input));
  assert.equal(oversized.reads(), 3);
  assert.equal(oversized.cancelled(), true);
});

test('response limits count UTF-8 bytes and reject dishonest or oversized Content-Length', async () => {
  let response = json({ ...verified(), padding: 'é'.repeat(4096) });
  mock.method(globalThis, 'fetch', async () => response);
  await unauthorized(new MobileAttestationVerifier().verify(input));
  const oversized = streamed([new TextEncoder().encode(marker)], { 'content-length': '8193' });
  response = oversized.response;
  await unauthorized(new MobileAttestationVerifier().verify(input));
  assert.equal(oversized.reads(), 0);
  assert.equal(oversized.cancelled(), true);
  const dishonest = streamed([new Uint8Array(8193).fill(32)], { 'content-length': '1' });
  response = dishonest.response;
  await unauthorized(new MobileAttestationVerifier().verify(input));
  assert.equal(dishonest.cancelled(), true);
});

test('trust-status response has its own byte limit, rejects non-boolean trust and does not cache failures', async () => {
  const oversized = streamed([new Uint8Array(1025).fill(32), new TextEncoder().encode(marker)]);
  let response = oversized.response; let calls = 0;
  mock.method(globalThis, 'fetch', async () => { calls++; return response; });
  const verifier = new MobileAttestationVerifier();
  const identity = { verifier: version, certificateSerials: 'abc,def' };
  await unauthorized(verifier.checkTrust(identity));
  assert.equal(oversized.reads(), 1);
  assert.equal(oversized.cancelled(), true);
  response = json({ trusted: 'true' });
  await unauthorized(verifier.checkTrust(identity));
  response = json({ trusted: true });
  await verifier.checkTrust(identity);
  await verifier.checkTrust(identity);
  assert.equal(calls, 3);
  response = json({ trusted: false });
  await unauthorized(verifier.checkTrust(identity, true));
  response = json({ trusted: true });
  await verifier.checkTrust(identity);
  assert.equal(calls, 5);
});

test('stored trust evidence is validated before any request or cache use', async () => {
  let calls = 0;
  mock.method(globalThis, 'fetch', async () => { calls++; return json({ trusted: true }); });
  for (const value of [null, [], {}, { verifier: marker, certificateSerials: 'abc,def' },
    { verifier: version, certificateSerials: 'abc' }, { verifier: version, certificateSerials: `abc,${'a'.repeat(8193)}` }]) {
    await unauthorized(new MobileAttestationVerifier().checkTrust(value));
  }
  assert.equal(calls, 0);
});

test('unread error bodies and stream failures are cancelled and never exposed', async () => {
  const unread = streamed([new TextEncoder().encode(marker)]);
  let response = new Response(unread.response.body, { status: 401 });
  mock.method(globalThis, 'fetch', async () => response);
  await unauthorized(new MobileAttestationVerifier().verify(input));
  assert.equal(unread.reads(), 0);
  assert.equal(unread.cancelled(), true);
  const failed = new ReadableStream<Uint8Array>({ pull() { throw new Error(marker); } });
  response = new Response(failed);
  await unauthorized(new MobileAttestationVerifier().verify(input));
  response = new Response(marker);
  await unauthorized(new MobileAttestationVerifier().verify(input));
});
