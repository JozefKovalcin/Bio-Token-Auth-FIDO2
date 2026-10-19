import { afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { WebAuthnAdapter } from '../dist/api/webauthn-adapter.js';
import { registrationFailureCode, reportRegistrationFailure, type RegistrationFailureCode } from '../dist/api/webauthn-diagnostics.js';

afterEach(() => mock.restoreAll());
const marker = 'SECRET_TEST_MARKER_MUST_NOT_BE_LOGGED';

function capture() {
  const calls: unknown[][] = [];
  mock.method(Logger.prototype, 'warn', (...args: unknown[]) => { calls.push(args); });
  return calls;
}

test('registration diagnostic output contains only finite codes and bounded chain counts, never error details', () => {
  const calls = capture();
  const nested = Object.assign(new Error(marker), { code: 'CERTIFICATE_PATH_VERIFICATION_FAILED', cause: new Error(marker) });
  assert.equal(registrationFailureCode(new Error(marker, { cause: nested })), 'certificate_path');
  reportRegistrationFailure(registrationFailureCode(new Error(marker, { cause: nested })), 1);
  reportRegistrationFailure(marker as RegistrationFailureCode, 1);
  reportRegistrationFailure('certificate_path', 6);
  reportRegistrationFailure('certificate_path', Number.NaN);
  assert.ok(calls.every(args => args.length === 1 && typeof args[0] === 'string'));
  assert.deepEqual(calls.map(args => JSON.parse(args[0] as string)), [
    { event: 'webauthn.registration_rejected', code: 'certificate_path', x5cCount: 1 },
    { event: 'webauthn.registration_rejected', code: 'verifier_rejected' },
    { event: 'webauthn.registration_rejected', code: 'certificate_path' },
    { event: 'webauthn.registration_rejected', code: 'certificate_path' },
  ]);
  assert.ok(!JSON.stringify(calls).includes(marker));
});

test('known library failures become finite classifications without forwarding message contents', () => {
  const cases = [
    ['Unexpected registration response challenge ', 'challenge_mismatch'],
    ['Unexpected registration response origin ', 'origin_mismatch'],
    ['Unexpected registration response type ', 'type_mismatch'],
    ['Unexpected RP ID hash', 'rp_mismatch'],
    ['User presence was required, but user was not present', 'up_required'],
    ['User verification was required, but user could not be verified', 'uv_required'],
    ['Certificate OU was not ', 'certificate_profile'],
    ['Certificate not good before ', 'certificate_validity'],
  ] as const;
  for (const [message, code] of cases) assert.equal(registrationFailureCode(new Error(message)), code);
  assert.equal(registrationFailureCode(new Error(marker)), 'verifier_rejected');
  assert.equal(registrationFailureCode({ message: marker, code: marker }), 'verifier_rejected');
});

function response(fmt: string, withChain = false, challenge = marker, origin = `https://${marker}.test`): RegistrationResponseJSON {
  const attStmt = new Map<string, unknown>();
  if (withChain) attStmt.set('x5c', [new Uint8Array([1])]);
  const object = isoCBOR.encode(new Map<string, unknown>([['fmt', fmt], ['attStmt', attStmt], ['authData', new Uint8Array(37)]]));
  return { id: marker, rawId: marker, type: 'public-key', clientExtensionResults: {}, response: {
    clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin })).toString('base64url'),
    attestationObject: Buffer.from(object).toString('base64url'),
  } };
}

test('actual adapter remains fail-closed for malformed, none and self attestation with redacted diagnostics', async () => {
  const calls = capture(); const adapter = new WebAuthnAdapter();
  const options = { expectedChallenge: 'expected-challenge', expectedOrigin: 'https://expected.test', expectedRPID: 'expected.test' };
  const malformed = response('packed'); malformed.response.attestationObject = 'AA';
  for (const value of [malformed, response('none'), response('packed'), response('packed', true)]) {
    await assert.rejects(adapter.registration({ ...options, response: value }), (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.equal(error.getStatus(), 401);
      assert.ok(!JSON.stringify(error.getResponse()).includes(marker));
      return true;
    });
  }
  assert.deepEqual(calls.map(args => JSON.parse(args[0] as string)), [
    { event: 'webauthn.registration_rejected', code: 'attestation_decode' },
    { event: 'webauthn.registration_rejected', code: 'attestation_format' },
    { event: 'webauthn.registration_rejected', code: 'attestation_chain', x5cCount: 0 },
    { event: 'webauthn.registration_rejected', code: 'challenge_mismatch' },
  ]);
  assert.ok(!JSON.stringify(calls).includes(marker));
});
