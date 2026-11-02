import { test, expect, type Page } from '@playwright/test';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const user = { username: 'browser-user', mode: 'B', totpActive: false, expiresAt: new Date(Date.now() + 3600_000).toISOString(), allowedModes: ['A', 'B'] };
async function mockApi(page: Page, advanced = false) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/capabilities') return route.fulfill({ json: { modes: advanced ? ['A', 'B', 'C'] : ['A'], webauthnEnabled: advanced, modeCEnabled: advanced } });
    if (path === '/api/auth/me') return route.fulfill({ status: 401, json: { message: 'Neprihlásený používateľ.' } });
    if (path === '/api/auth/c/cancel') return route.fulfill({ json: { cancelled: true } });
    return route.fulfill({ status: 400, json: { message: 'Test endpoint.' } });
  });
}

test('logout refreshes server capabilities after C is enabled during the session without reloading', async ({ page }) => {
  let modeCEnabled = false; let capabilityRequests = 0; let sessionRequests = 0; let navigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/capabilities') {
      capabilityRequests++;
      return route.fulfill({ json: { modes: modeCEnabled ? ['A', 'B', 'C'] : ['A', 'B'], webauthnEnabled: true, modeCEnabled } });
    }
    if (path === '/api/auth/me') {
      sessionRequests++;
      return route.fulfill({ status: 401, json: { message: 'Neprihlásený používateľ.' } });
    }
    if (path === '/api/auth/password') return route.fulfill({ json: { step: 'done', user: { ...user, mode: 'A' } } });
    if (path === '/api/auth/logout') return route.fulfill({ json: { loggedOut: true } });
    return route.fulfill({ status: 400, json: { message: 'Test endpoint.' } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Režim B', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Režim C', exact: true })).toBeDisabled();
  await page.getByLabel('Používateľské meno').fill(user.username);
  await page.getByLabel('Heslo', { exact: true }).fill('TEST-ONLY-password');
  await page.getByRole('button', { name: 'Pokračovať', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Vitajte, ${user.username}.` })).toBeVisible();
  modeCEnabled = true;
  await page.getByRole('button', { name: 'Odhlásiť sa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Režim C', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Režim C', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Režim C', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(capabilityRequests).toBe(2);
  expect(sessionRequests).toBe(1);
  expect(navigations).toBe(1);
});

test('unavailable modes remain disabled and A registration remains accessible', async ({ page }) => {
  await mockApi(page); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Režim B', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Režim C', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /Ešte nemáte účet/ }).click();
  await expect(page.getByRole('heading', { name: 'Vytvorte si účet.' })).toBeVisible();
  await page.getByLabel('Používateľské meno').fill('browser-user');
  await page.locator('#password').fill('test-password-123');
  await page.locator('#password-confirm').fill('different-password');
  await page.getByRole('button', { name: /Vytvoriť účet/, exact: false }).last().click();
  await expect(page.getByRole('alert')).toHaveText(/Heslá|heslá/);
});

test('B requires password and an actual virtual WebAuthn assertion before showing account', async ({ page, context }) => {
  await mockApi(page, true);
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true,
  } });
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const credentialId = randomBytes(32);
  await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: {
    credentialId: credentialId.toString('base64'), isResidentCredential: false, rpId: 'localhost',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), signCount: 0,
  } });
  await page.route('**/api/auth/b/password', route => route.fulfill({ json: { step: 'webauthn', expiresAt: user.expiresAt } }));
  await page.route('**/api/auth/b/options', route => route.fulfill({ json: { options: {
    challenge: randomBytes(32).toString('base64url'), rpId: 'localhost', userVerification: 'required',
    allowCredentials: [{ id: credentialId.toString('base64url'), type: 'public-key', transports: ['usb'] }],
  } } }));
  let assertions = 0;
  await page.route('**/api/auth/b/verify', route => {
    const response = route.request().postDataJSON().response;
    expect(response.id).toBe(credentialId.toString('base64url'));
    expect(response.response.signature.length).toBeGreaterThan(40);
    assertions++; return route.fulfill({ json: user });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Režim B', exact: true }).click();
  await page.getByLabel('Používateľské meno').fill(user.username);
  await page.getByLabel('Heslo', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Overiť heslo', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Vitajte, ${user.username}.` })).not.toBeVisible();
  await page.getByRole('button', { name: 'Overiť YubiKey', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Vitajte, ${user.username}.` })).toBeVisible();
  expect(assertions).toBe(1);
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
});

test('C failure stays in C and never submits password or completes authentication', async ({ page }) => {
  await mockApi(page, true);
  let otherCalls = 0;
  page.on('request', req => { if (/\/api\/auth\/(?:password|b\/password|c\/complete)$/.test(req.url())) otherCalls++; });
  await page.route('**/api/auth/c/options', route => route.fulfill({ status: 503, json: { message: 'Overenie momentálne nie je dostupné.' } }));
  await page.goto('/'); await page.getByRole('button', { name: 'Režim C', exact: true }).click();
  await page.getByRole('button', { name: 'Overiť YubiKey', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Overenie momentálne nie je dostupné.');
  await expect(page.getByRole('button', { name: 'Režim C', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(otherCalls).toBe(0);
});

test('C polling sends its expected transaction ID and stops on a stale-tab rejection', async ({ page, context }) => {
  await mockApi(page, true);
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true,
  } });
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: {
    credentialId: randomBytes(32).toString('base64'), userHandle: randomBytes(32).toString('base64'),
    isResidentCredential: true, rpId: 'localhost',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), signCount: 0,
  } });
  const id = '11111111-2222-4333-8444-555555555555';
  await page.route('**/api/auth/c/options', route => route.fulfill({ json: { options: {
    challenge: randomBytes(32).toString('base64url'), rpId: 'localhost', userVerification: 'required',
  } } }));
  await page.route('**/api/auth/c/verify', route => route.fulfill({ json: {
    state: 'PENDING_MOBILE', transactionId: id, capability: randomBytes(32).toString('base64url'), expiresAt: new Date(Date.now() + 60_000).toISOString(),
  } }));
  let polls = 0; let completes = 0;
  await page.route('**/api/auth/c/status?**', route => {
    expect(new URL(route.request().url()).searchParams.get('transactionId')).toBe(id); polls++;
    return route.fulfill({ status: 401, json: { message: 'Replaced transaction' } });
  });
  await page.route('**/api/auth/c/complete', route => { completes++; return route.fulfill({ status: 401, json: {} }); });
  await page.goto('/'); await page.getByRole('button', { name: 'Režim C', exact: true }).click();
  await page.getByRole('button', { name: 'Overiť YubiKey', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Prihlásenie už nie je platné. Začnite znova.');
  await expect(page.getByRole('button', { name: 'Začať znova', exact: true })).toBeVisible();
  expect(polls).toBe(1); expect(completes).toBe(0);
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
});

test('C pairing consent expires even after a phone candidate stops QR polling', async ({ page, context }) => {
  await mockApi(page, true);
  await page.clock.install({ time: new Date() });
  await page.route('**/api/auth/me', route => route.fulfill({ json: { ...user, mode: 'A' } }));
  await page.route('**/api/account/webauthn', route => route.fulfill({ json: { credentials: [{ id: 'TEST-ONLY', profile: 'C', state: 'ACTIVE' }] } }));
  await page.route('**/api/account/devices', route => route.fulfill({ json: [] }));
  await page.route('**/api/account/reauth', route => route.fulfill({ json: { grant: 'TEST-ONLY' } }));
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true,
  } });
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const credentialId = randomBytes(32);
  await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: {
    credentialId: credentialId.toString('base64'), userHandle: randomBytes(32).toString('base64'),
    isResidentCredential: true, rpId: 'localhost',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), signCount: 0,
  } });
  await page.route('**/api/account/webauthn/proofs/options', route => route.fulfill({ json: { proofId: 'TEST-ONLY', options: {
    challenge: randomBytes(32).toString('base64url'), rpId: 'localhost', userVerification: 'required',
    allowCredentials: [{ id: credentialId.toString('base64url'), type: 'public-key', transports: ['usb'] }],
  } } }));
  await page.route('**/api/account/webauthn/proofs/verify', route => route.fulfill({ json: { verified: true } }));
  const pairingId = '11111111-2222-4333-8444-555555555555';
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  await page.route('**/api/account/pairings', route => route.fulfill({ json: { pairingId, expiresAt,
    qr: { v: 1, type: 'pairing', token: 'TEST-ONLY', origin: 'https://bio.test' },
  } }));
  await page.route(`**/api/account/pairings/${pairingId}`, route => route.fulfill({ json: { pairingId, expiresAt, status: 'AWAITING_PC_CONFIRMATION',
    candidate: { deviceId: 'TEST-ONLY', label: 'Test phone', confirmationCode: 'TEST-CODE' },
  } }));
  let confirmations = 0;
  await page.route(`**/api/account/pairings/${pairingId}/confirm`, route => {
    confirmations++; return route.fulfill({ json: { status: 'CONFIRMED' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Bezpečnostné kľúče, telefóny a režimy' }).click();
  await page.getByRole('button', { name: 'Spárovať telefón cez YubiKey C' }).click();
  await expect(page.getByLabel('Zadajte kód z telefónu')).toBeVisible();
  await page.getByLabel('Zadajte kód z telefónu').fill('TEST-CODE');
  await page.clock.fastForward(61_000);
  await expect(page.getByRole('alert')).toHaveText('Párovanie vypršalo. Začnite znova.');
  await expect(page.getByLabel('Zadajte kód z telefónu')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Spárovať telefón cez YubiKey C' })).toBeEnabled();
  expect(confirmations).toBe(0);
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
});

test('registration is reachable from C and returns to mode A with a working password toggle', async ({ page }) => {
  await mockApi(page, true); await page.goto('/');
  await page.getByRole('button', { name: 'Režim C', exact: true }).click();
  await expect(page.locator('#factor-one')).toHaveText(/YubiKey/);
  await expect(page.locator('#factor-two')).toHaveText(/Telefón/);
  await page.getByRole('button', { name: /Ešte nemáte účet/ }).click();
  await expect(page.getByRole('heading', { name: 'Vytvorte si účet.' })).toBeVisible();
  await expect(page.locator('#factor-one')).toHaveText(/Heslo/);
  await page.locator('#password').fill('TEST-ONLY-password');
  await page.getByRole('button', { name: 'Zobraziť heslo', exact: true }).first().click();
  await expect(page.locator('#password')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: /Už máte účet/ }).click();
  await expect(page.getByRole('button', { name: 'Režim A', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#password')).toHaveValue('');
});

test('mobile account controls stay within the card and policy save needs a change', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockApi(page, true);
  await page.route('**/api/auth/me', route => route.fulfill({ json: { ...user, mode: 'A' } }));
  await page.route('**/api/account/webauthn', route => route.fulfill({ json: { credentials: [{ id: 'candidate', profile: 'C', state: 'CANDIDATE' }] } }));
  await page.route('**/api/account/devices', route => route.fulfill({ json: [] }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Bezpečnostné kľúče, telefóny a režimy' }).click();
  await expect(page.getByRole('button', { name: 'Potvrdiť kľúč', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Spárovať telefón cez YubiKey C' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Uložiť povolené režimy' })).toBeDisabled();
  const check = page.getByRole('checkbox', { name: 'Režim C', exact: true });
  await check.check();
  await expect(page.getByRole('button', { name: 'Uložiť povolené režimy' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const size = await check.boundingBox();
  expect(size?.height).toBe(20);
  await page.getByRole('button', { name: 'Bezpečnostné kľúče, telefóny a režimy' }).click();
  await expect(page.getByRole('heading', { name: 'Bezpečnostné kľúče YubiKey' })).not.toBeVisible();
});
