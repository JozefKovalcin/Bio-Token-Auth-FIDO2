import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const [origin, certificate] = process.argv.slice(2);
if (!origin || !certificate || new URL(origin).protocol !== 'https:') {
  throw new Error('Usage: node tests/https-smoke.mjs https://LAN-IP path/to/root.crt');
}
const ca = await readFile(certificate);
function request(path, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    // Keep Node's default certificate/hostname verification and IP-without-SNI behavior.
    const req = https.request(new URL(path, origin), { ca, method,
      headers: body ? { 'Content-Type': 'application/json' } : {} }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.setTimeout(10_000, () => req.destroy(new Error('HTTPS request timed out')));
    req.on('error', reject); req.end(body);
  });
}
const health = await request('/api/health');
assert.equal(health.status, 200); assert.equal(JSON.parse(health.text).status, 'ok');
assert.equal((await request('/api/auth/me')).status, 401);
assert.equal((await request('/api/auth/logout', 'POST', '{}')).status, 403);
const page = await request('/'); assert.equal(page.status, 200);
assert.match(page.text, /Bio Token Auth/);
assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
const redirect = await new Promise((resolve, reject) => {
  const url = new URL(origin); url.protocol = 'http:'; url.port = '80';
  http.get(url, res => { res.resume(); resolve({ status: res.statusCode, location: res.headers.location }); }).on('error', reject);
});
assert.equal(redirect.status, 308); assert.equal(redirect.location, new URL('/', origin).href);
console.log('PASS: TLS chain and hostname, IP without SNI, HTTPS web/API, anonymous access, CSRF, CSP and HTTP redirect.');
