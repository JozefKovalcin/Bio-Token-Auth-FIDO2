import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';

const name = `bio-attestation-smoke-${randomUUID().slice(0, 8)}`;
const secret = randomBytes(32).toString('hex');
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let started = false;
try {
  docker(['run', '--detach', '--rm', '--name', name, '-p', '127.0.0.1::8081',
    '-e', `ATTESTATION_SERVICE_TOKEN=${secret}`, '-e', 'ATTESTATION_PACKAGE_NAME=sk.biotoken.android',
    '-e', `ATTESTATION_SIGNING_CERT_SHA256=${'0'.repeat(64)}`, 'bio-attestation-check']);
  started = true;
  const mapped = docker(['port', name, '8081/tcp']).trim();
  assert.match(mapped, /^127\.0\.0\.1:\d+$/);
  const base = `http://${mapped}`;
  let available = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    try { available = (await fetch(`${base}/health`)).status === 200; } catch {}
    if (available) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(available, true, 'Verifier must become ready');
  for (const path of ['/verify', '/trust-status']) {
    const missing = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(missing.status, 401);
    const invalid = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: '{}' });
    assert.equal(invalid.status, 401);
  }
  console.log('PASS: verifier health, service authorization and fail-closed malformed enrollment/trust evidence');
} finally {
  if (started) docker(['stop', name]);
}
