import { after, before, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { SettingsService, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { decodeAttestationObject, isoCBOR } from '@simplewebauthn/server/helpers';
import { WebAuthnAdapter } from '../dist/api/webauthn-adapter.js';
import { WebAuthnIntermediates } from '../dist/api/webauthn-intermediates.js';

let directory: string; let root: string; let wrongRoot: string; let upper: string; let issuer: string; let wrongIssuer: string;
const origin = 'https://packed-fixture.test'; const rpId = 'packed-fixture.test'; const challenge = 'signed-test-challenge';
const options = { expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpId, requireUserPresence: true, requireUserVerification: true };
const cert = (name: string) => readFileSync(join(directory, `${name}.pem`), 'utf8');
let serial = 1;
function openssl(...args: string[]) { execFileSync('openssl', args, { cwd: directory, stdio: 'ignore', windowsHide: true }); }
function request(name: string, subject: string, keyName = name) {
  const args = ['req', '-config', 'request.cnf', '-new', '-subj', subject, '-out', `${name}.csr`];
  if (keyName === name) args.push('-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', `${name}.key`);
  else args.push('-key', `${keyName}.key`);
  openssl(...args);
}
function issue(name: string, parent: string, extension: 'ca' | 'leaf', days = '2') {
  openssl('x509', '-req', '-in', `${name}.csr`, '-CA', `${parent}.pem`, '-CAkey', `${parent}.key`,
    '-set_serial', String(serial++), '-days', days, '-sha256', '-extfile', `${extension}.ext`, '-out', `${name}.pem`);
}

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'bio-packed-public-test-pki-'));
  writeFileSync(join(directory, 'request.cnf'), '[req]\ndistinguished_name=dn\n[dn]\n');
  writeFileSync(join(directory, 'ca.ext'), 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n');
  writeFileSync(join(directory, 'leaf.ext'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n');
  for (const name of ['root', 'wrong-root']) {
    openssl('req', '-config', 'request.cnf', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', `${name}.key`,
      '-subj', `/C=SK/O=Test Only/CN=${name}`, '-days', '2', '-sha256', '-addext', 'basicConstraints=critical,CA:TRUE',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-out', `${name}.pem`);
  }
  request('upper', '/C=SK/O=Test Only/CN=Upper'); issue('upper', 'root', 'ca');
  request('issuer', '/C=SK/O=Test Only/CN=Issuer'); issue('issuer', 'upper', 'ca');
  request('wrong-issuer', '/C=SK/O=Test Only/CN=Issuer'); issue('wrong-issuer', 'upper', 'ca');
  request('expired-issuer', '/C=SK/O=Test Only/CN=Expired Issuer'); issue('expired-issuer', 'upper', 'ca', '0');
  request('issuer-alternative', '/C=SK/O=Test Only/CN=Issuer', 'issuer'); issue('issuer-alternative', 'upper', 'ca');
  request('leaf', '/C=SK/O=Test Only/OU=Authenticator Attestation/CN=Packed Test Leaf'); issue('leaf', 'issuer', 'leaf');
  root = cert('root'); wrongRoot = cert('wrong-root'); upper = cert('upper'); issuer = cert('issuer'); wrongIssuer = cert('wrong-issuer');
  mock.method(Logger.prototype, 'warn', () => {});
});
after(() => { mock.restoreAll(); if (directory) rmSync(directory, { recursive: true, force: true }); });

function response(flags = 0x45): RegistrationResponseJSON {
  const credential = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' });
  const publicKey = isoCBOR.encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1],
    [-2, Buffer.from(credential.x!, 'base64url')], [-3, Buffer.from(credential.y!, 'base64url')]]));
  const id = randomBytes(32); const size = Buffer.alloc(2); size.writeUInt16BE(id.length);
  const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }));
  const authData = Buffer.concat([createHash('sha256').update(rpId).digest(), Buffer.from([flags]), Buffer.alloc(4),
    Buffer.alloc(16, 1), size, id, Buffer.from(publicKey)]);
  const signature = sign('sha256', Buffer.concat([authData, createHash('sha256').update(clientDataJSON).digest()]), readFileSync(join(directory, 'leaf.key')));
  const attStmt = new Map<string, unknown>([['alg', -7], ['sig', new Uint8Array(signature)], ['x5c', [new Uint8Array(new X509Certificate(cert('leaf')).raw)]]]);
  const attestationObject = isoCBOR.encode(new Map<string, unknown>([['fmt', 'packed'], ['authData', new Uint8Array(authData)], ['attStmt', attStmt]]));
  return { id: id.toString('base64url'), rawId: id.toString('base64url'), type: 'public-key', clientExtensionResults: {},
    response: { clientDataJSON: clientDataJSON.toString('base64url'), attestationObject: Buffer.from(attestationObject).toString('base64url'), transports: ['usb'] } };
}
function adapter(intermediates = [issuer, upper], trust = root) {
  SettingsService.setRootCertificates({ identifier: 'packed', certificates: [trust] });
  const value = new WebAuthnAdapter(); value.configureRegistrationIntermediates(intermediates, [trust]); return value;
}
async function rejected(value: WebAuthnAdapter, registration: RegistrationResponseJSON) {
  await assert.rejects(value.registration({ ...options, response: registration }), (error: unknown) => error instanceof UnauthorizedException && error.getStatus() === 401);
}
function modify(registration: RegistrationResponseJSON, mutate: (object: Map<string, any>) => void) {
  const object = decodeAttestationObject(Buffer.from(registration.response.attestationObject, 'base64url')) as Map<string, any>;
  mutate(object);
  return { ...registration, response: { ...registration.response, attestationObject: Buffer.from(isoCBOR.encode(object)).toString('base64url') } };
}

test('actual signed packed leaf-only registration needs configured intermediates and remains anchored only at the root', async () => {
  const registration = response(); const original = structuredClone(registration);
  SettingsService.setRootCertificates({ identifier: 'packed', certificates: [root] });
  await rejected(new WebAuthnAdapter(), registration);
  const info = await adapter().registration({ ...options, response: registration });
  assert.equal(info.fmt, 'packed'); assert.equal(info.userVerified, true); assert.equal(info.credential.id, registration.id);
  assert.deepEqual(SettingsService.getRootCertificates({ identifier: 'packed' }), [root]);
  assert.deepEqual(registration, original);
  const before = decodeAttestationObject(Buffer.from(original.response.attestationObject, 'base64url'));
  const after = decodeAttestationObject(info.attestationObject);
  assert.equal(after.get('attStmt').get('x5c')!.length, 3);
  assert.deepEqual(after.get('authData'), before.get('authData'));
  assert.deepEqual(after.get('attStmt').get('sig'), before.get('attStmt').get('sig'));
  assert.equal(after.get('attStmt').get('alg'), before.get('attStmt').get('alg'));
});

test('wrong root, wrong or missing intermediate, forged signature, modified payload and missing UP/UV stay rejected', async () => {
  await rejected(adapter([issuer, upper], wrongRoot), response());
  await rejected(adapter([wrongIssuer, upper]), response());
  await rejected(adapter([issuer]), response());
  await rejected(adapter(), modify(response(), object => object.get('attStmt').set('sig', new Uint8Array(64))));
  await rejected(adapter(), modify(response(), object => { object.get('authData')[36] = 1; }));
  await rejected(adapter(), response(0x41)); // UP without UV
  await rejected(adapter(), response(0x44)); // UV without UP
  await rejected(adapter(), modify(response(), object => { object.set('fmt', 'none'); object.set('attStmt', new Map()); }));
  await rejected(adapter(), modify(response(), object => object.get('attStmt').delete('x5c')));
});

test('pool rejects roots, non-CA and duplicate certificates; completion rejects duplicate, ambiguous and oversized chains', () => {
  for (const pool of [[root], [cert('leaf')], [issuer, issuer], [cert('expired-issuer')]]) assert.throws(() => new WebAuthnIntermediates(pool, [root]));
  assert.throws(() => new WebAuthnIntermediates([issuer], []));
  const leaf = new Uint8Array(new X509Certificate(cert('leaf')).raw);
  assert.throws(() => new WebAuthnIntermediates([issuer, upper], [root]).complete([leaf, leaf]));
  assert.throws(() => new WebAuthnIntermediates([issuer, cert('issuer-alternative'), upper], [root]).complete([leaf]));
  assert.throws(() => new WebAuthnIntermediates([issuer, upper], [root]).complete(Array(6).fill(leaf)));
});
