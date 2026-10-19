import { Injectable, BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { SettingsService } from '@simplewebauthn/server';
import type { AuthTransaction, WebAuthnCredential } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { randomUUID, X509Certificate } from 'node:crypto';
import * as argon2 from 'argon2';
import { Database } from './database.js';
import { digest, token } from './crypto.js';
import { AuthService, passwordOptions } from './auth.service.js';
import { SessionPolicyService, invalid, type Tx, type Mode } from './session-policy.service.js';
import { WebAuthnAdapter, type RegistrationResponseJSON, type AuthenticationResponseJSON } from './webauthn-adapter.js';
import { audit } from './audit.js';

const ttl = 120_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const expiry = () => new Date(Date.now() + ttl);
const isLive = (value: { expiresAt: Date }) => value.expiresAt > new Date();

@Injectable()
export class WebAuthnService {
  private readonly enabled = process.env.WEBAUTHN_ENABLED === 'true';
  private readonly cEnabled = process.env.MODE_C_ENABLED === 'true' && process.env.MODE_C_HARDWARE_VERIFIED === 'true' &&
    Boolean(process.env.ATTESTATION_SERVICE_URL && process.env.ATTESTATION_SERVICE_TOKEN);
  private readonly origin = process.env.APP_ORIGIN ?? '';
  private readonly rpId = process.env.WEBAUTHN_RP_ID ?? '';
  private readonly aaguids = new Set((process.env.WEBAUTHN_AAGUID_ALLOWLIST ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  private readonly dummyHash = argon2.hash(token(), passwordOptions);
  constructor(private readonly db: Database, private readonly policy: SessionPolicyService,
    private readonly auth: AuthService, private readonly adapter: WebAuthnAdapter) {
    if (this.enabled) {
      const host = new URL(this.origin).hostname;
      if (!this.rpId || isIP(this.rpId) || !/^[a-z0-9.-]+$/.test(this.rpId) ||
        (host !== this.rpId && !host.endsWith(`.${this.rpId}`))) throw new Error('Configure a stable DNS WEBAUTHN_RP_ID matching APP_ORIGIN');
      if (!this.aaguids.size || [...this.aaguids].some(a => !uuidPattern.test(a))) throw new Error('WEBAUTHN_AAGUID_ALLOWLIST must contain approved YubiKey model AAGUIDs');
      const roots: unknown = JSON.parse(readFileSync(process.env.WEBAUTHN_TRUSTED_ROOTS_FILE ?? '', 'utf8'));
      if (!Array.isArray(roots) || !roots.length || roots.length > 10 || roots.some(r => typeof r !== 'string')) throw new Error('WEBAUTHN_TRUSTED_ROOTS_FILE must contain approved PEM roots');
      for (const root of roots) {
        const cert = new X509Certificate(root);
        if (!cert.ca || Date.parse(cert.validTo) <= Date.now()) throw new Error('Invalid WebAuthn trust root');
      }
      SettingsService.setRootCertificates({ identifier: 'packed', certificates: roots });
    }
  }
  capabilities() { return { modes: ['A', ...(this.enabled ? ['B'] : []), ...(this.enabled && this.cEnabled ? ['C'] : [])],
    webauthnEnabled: this.enabled, modeCEnabled: this.enabled && this.cEnabled }; }
  private requireEnabled(mode?: string) {
    if (!this.enabled || (mode === 'C_LOGIN' && !this.cEnabled)) throw new ServiceUnavailableException('Tento režim ešte nie je pripravený na tomto serveri.');
  }
  private async ceremony(id: string, raw: string | undefined, purpose: string) {
    if (!raw || !uuidPattern.test(id)) throw invalid();
    const value = await this.db.authTransaction.findUnique({ where: { id } });
    if (!value || value.purpose !== purpose || value.sourceSessionHash !== digest(raw) || !isLive(value) || value.attempts >= 5) throw invalid();
    const session = await this.policy.fresh(raw);
    if (value.userId !== session.userId || value.securityVersion !== session.user.securityVersion) throw invalid();
    return value;
  }
  private async reserve(value: AuthTransaction) {
    const count = await this.db.authTransaction.updateMany({ where: { id: value.id, version: value.version,
      state: value.state, attempts: { lt: 5 }, expiresAt: { gt: new Date() } }, data: { attempts: { increment: 1 } } });
    if (count.count !== 1) throw invalid();
  }
  private async consume(tx: Tx, value: AuthTransaction, state: string, extra: Record<string, unknown> = {}) {
    const result = await tx.authTransaction.updateMany({ where: { id: value.id, version: value.version,
      state: value.state, challenge: value.challenge, expiresAt: { gt: new Date() } },
      data: { ...extra, state, version: { increment: 1 } } });
    if (result.count !== 1) throw invalid();
  }
  async registrationOptions(raw: string | undefined, profile: string, grant: string) {
    this.requireEnabled();
    if (!['B', 'C'].includes(profile)) throw new BadRequestException('Neplatný profil.');
    const session = await this.policy.fresh(raw);
    await this.auth.limit(`webauthn-enroll:${session.userId}`, 10);
    const existing = await this.db.webAuthnCredential.findMany({ where: { userId: session.userId, state: { not: 'REVOKED' } } });
    if (existing.length >= 10) throw new ConflictException('Najprv odvolajte nepoužívaný kľúč.');
    const userHandle = token();
    const options = await this.adapter.registrationOptions({ rpName: 'Bio Token Auth', rpID: this.rpId,
      userID: Buffer.from(userHandle, 'base64url'), userName: session.user.username, attestationType: 'direct',
      authenticatorSelection: { authenticatorAttachment: 'cross-platform', residentKey: profile === 'C' ? 'required' : 'discouraged', userVerification: 'required' },
      supportedAlgorithmIDs: [-7, -257], timeout: ttl, extensions: { credProps: true },
      // Separate user handles avoid resident-key replacement across distinct enrollments.
      // Cross-profile exclusion would prevent B and C enrollment on the same physical YubiKey.
      excludeCredentials: existing.filter(c => c.profile === profile).map(c => ({ id: c.credentialId, transports: c.transports })) });
    const expiresAt = expiry(); const id = randomUUID();
    await this.db.$transaction(async tx => {
      await this.policy.lockUser(tx, session.userId);
      await this.policy.consumeGrant(tx, raw, grant, 'ENROLL');
      await tx.authTransaction.create({ data: { id, tokenHash: digest(token()), userId: session.userId,
        mode: profile, purpose: 'REGISTER', state: 'PENDING_REGISTRATION', challenge: options.challenge,
        userHandle, sourceSessionHash: session.tokenHash, securityVersion: session.securityVersion, expiresAt } });
    });
    return { registrationId: id, options, expiresAt };
  }
  async registrationVerify(raw: string | undefined, id: string, response: RegistrationResponseJSON) {
    this.requireEnabled();
    const ceremony = await this.ceremony(id, raw, 'REGISTER');
    if (ceremony.state !== 'PENDING_REGISTRATION' || !ceremony.challenge || !ceremony.userHandle) throw invalid();
    await this.reserve(ceremony);
    const info = await this.adapter.registration({ response, expectedChallenge: ceremony.challenge,
      expectedOrigin: this.origin, expectedRPID: this.rpId, expectedType: 'webauthn.create',
      requireUserPresence: true, requireUserVerification: true, supportedAlgorithmIDs: [-7, -257] });
    if (!this.aaguids.has(info.aaguid.toLowerCase())) throw invalid();
    const credentialId = randomUUID();
    await this.db.$transaction(async tx => {
      const user = await this.policy.lockUser(tx, ceremony.userId!);
      await this.policy.fresh(raw, tx);
      if (user.securityVersion !== ceremony.securityVersion) throw invalid();
      if (await tx.webAuthnCredential.count({ where: { userId: user.id, state: { not: 'REVOKED' } } }) >= 10) throw invalid();
      await tx.webAuthnCredential.create({ data: { id: credentialId, credentialId: info.credential.id,
        userId: user.id, userHandle: ceremony.userHandle!, profile: ceremony.mode,
        publicKey: Buffer.from(info.credential.publicKey), counter: BigInt(info.credential.counter), rpId: this.rpId,
        aaguid: info.aaguid, transports: info.credential.transports ?? [],
        backedUp: info.credentialBackedUp, deviceType: info.credentialDeviceType, attestationVerified: true } });
      await this.consume(tx, ceremony, 'CONSUMED', { credentialId });
      await audit(tx, user.id, 'credential.registered', { credentialId, profile: ceremony.mode });
    }).catch(error => { if (error?.code === 'P2002') throw new ConflictException('Kľúč už bol zaregistrovaný.'); throw error; });
    return { credentialId, state: 'CANDIDATE' };
  }
  async proofOptions(raw: string | undefined, purpose: 'ACTIVATE' | 'PAIRING', credentialId?: string) {
    this.requireEnabled();
    const session = await this.policy.fresh(raw);
    await this.auth.limit(`webauthn-proof:${session.userId}`, 20);
    const credentials = await this.db.webAuthnCredential.findMany({ where: { userId: session.userId, rpId: this.rpId,
      ...(purpose === 'ACTIVATE' ? { id: credentialId, state: 'CANDIDATE' } : { profile: 'C', state: 'ACTIVE' }) } });
    if (!credentials.length || (purpose === 'ACTIVATE' && !credentialId)) throw invalid();
    const mode = purpose === 'ACTIVATE' ? credentials[0].profile : 'C';
    const options = await this.adapter.authenticationOptions({ rpID: this.rpId, timeout: ttl, userVerification: 'required',
      allowCredentials: credentials.map(c => ({ id: c.credentialId, transports: c.transports })) });
    const expiresAt = expiry(); const id = randomUUID();
    await this.db.$transaction(async tx => {
      await this.policy.lockUser(tx, session.userId); await this.policy.fresh(raw, tx);
      await tx.authTransaction.create({ data: { id, tokenHash: digest(token()), userId: session.userId, mode,
        purpose, state: 'PENDING_YUBIKEY', challenge: options.challenge, credentialId: purpose === 'ACTIVATE' ? credentialId : null,
        sourceSessionHash: session.tokenHash, securityVersion: session.securityVersion, expiresAt } });
    });
    return { proofId: id, options, expiresAt };
  }
  private async verifyAssertion(value: AuthTransaction, response: AuthenticationResponseJSON, state = 'ACTIVE', discoverable = false) {
    if (!value.challenge) throw invalid();
    const credential = await this.db.webAuthnCredential.findUnique({ where: { credentialId: response.id } });
    if (!credential || credential.state !== state || credential.profile !== value.mode || credential.rpId !== this.rpId ||
      !credential.attestationVerified || !this.aaguids.has(credential.aaguid.toLowerCase()) ||
      (value.userId && credential.userId !== value.userId) || (value.credentialId && credential.id !== value.credentialId)) throw invalid();
    if ((discoverable && !response.response.userHandle) ||
      (response.response.userHandle && response.response.userHandle !== credential.userHandle)) throw invalid();
    await this.auth.limit(`webauthn-verify:${credential.userId}`, 30);
    const info = await this.adapter.authentication({ response, expectedChallenge: value.challenge,
      expectedOrigin: this.origin, expectedRPID: this.rpId, expectedType: 'webauthn.get', requireUserVerification: true,
      credential: { id: credential.credentialId, publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter), transports: credential.transports } });
    return { credential, info };
  }
  private async advanceCredential(tx: Tx, credential: WebAuthnCredential, counter: number, activate = false) {
    const changed = await tx.webAuthnCredential.updateMany({ where: { id: credential.id, version: credential.version,
      counter: credential.counter, state: credential.state }, data: { counter: BigInt(counter), version: { increment: 1 },
        ...(activate ? { state: 'ACTIVE', proofAt: new Date() } : {}) } });
    // A parallel assertion/revocation must never overwrite a newer signature counter.
    if (changed.count !== 1) throw invalid();
  }
  async proofVerify(raw: string | undefined, id: string, response: AuthenticationResponseJSON, purpose: 'ACTIVATE' | 'PAIRING') {
    this.requireEnabled();
    const ceremony = await this.ceremony(id, raw, purpose);
    if (ceremony.state !== 'PENDING_YUBIKEY') throw invalid();
    await this.reserve(ceremony);
    const { credential, info } = await this.verifyAssertion(ceremony, response, purpose === 'ACTIVATE' ? 'CANDIDATE' : 'ACTIVE');
    await this.db.$transaction(async tx => {
      const user = await this.policy.lockUser(tx, credential.userId); await this.policy.fresh(raw, tx);
      if (user.securityVersion !== ceremony.securityVersion) throw invalid();
      await this.advanceCredential(tx, credential, info.newCounter, purpose === 'ACTIVATE');
      await this.consume(tx, ceremony, purpose === 'ACTIVATE' ? 'CONSUMED' : 'VERIFIED_YUBIKEY',
        { credentialId: credential.id, webauthnVerifiedAt: new Date() });
      await audit(tx, user.id, purpose === 'ACTIVATE' ? 'credential.activated' : 'credential.proved', { credentialId: credential.id, profile: credential.profile });
    });
    return purpose === 'ACTIVATE' ? { credentialId: credential.id, state: 'ACTIVE' } : { proofId: id, verified: true };
  }
  async bPassword(username: string, password: string, ip: string, oldPending?: string, oldSession?: string) {
    this.requireEnabled();
    await this.auth.limit(`password-ip:${ip}`, 30); await this.auth.limit(`password-account:${username}`, 10);
    const user = await this.db.user.findUnique({ where: { username } });
    const valid = await argon2.verify(user?.passwordHash ?? await this.dummyHash, password);
    if (!valid || !user || user.disabled || !user.allowedModes.includes('B')) throw invalid();
    const pendingToken = token(); const expiresAt = expiry();
    await this.db.$transaction(async tx => {
      const current = await this.policy.lockUser(tx, user.id);
      if (!current.allowedModes.includes('B') || current.securityVersion !== user.securityVersion || current.passwordHash !== user.passwordHash ||
        !await tx.webAuthnCredential.count({ where: { userId: user.id, profile: 'B', state: 'ACTIVE', attestationVerified: true } })) throw invalid();
      await this.cancelPrevious(tx, oldPending);
      await tx.authTransaction.create({ data: { tokenHash: digest(pendingToken), userId: user.id, mode: 'B', purpose: 'LOGIN',
        state: 'PENDING_YUBIKEY', securityVersion: current.securityVersion, passwordVerifiedAt: new Date(),
        oldSessionHash: oldSession ? digest(oldSession) : null, expiresAt } });
    });
    return { pendingToken, step: 'webauthn', expiresAt };
  }
  private async cancelPrevious(tx: Tx, oldPending?: string) {
    if (oldPending) {
      await tx.pending.deleteMany({ where: { tokenHash: digest(oldPending) } });
      await tx.authTransaction.updateMany({ where: { tokenHash: digest(oldPending), state: { notIn: ['CONSUMED', 'REJECTED', 'CANCELLED'] } },
        data: { state: 'CANCELLED', version: { increment: 1 } } });
    }
  }
  async pending(raw: string | undefined, mode: string) {
    if (!raw) throw invalid();
    const value = await this.db.authTransaction.findUnique({ where: { tokenHash: digest(raw) } });
    if (!value || value.mode !== mode || !isLive(value) || value.attempts >= 5 || !['LOGIN', 'C_ACTIVATION'].includes(value.purpose)) throw invalid();
    return value;
  }
  async bOptions(raw: string | undefined) {
    this.requireEnabled(); const value = await this.pending(raw, 'B');
    if (!value.userId || value.state !== 'PENDING_YUBIKEY' || !value.passwordVerifiedAt) throw invalid();
    const user = await this.db.user.findUniqueOrThrow({ where: { id: value.userId } });
    if (user.disabled || !user.allowedModes.includes('B') || user.securityVersion !== value.securityVersion) throw invalid();
    await this.auth.limit(`webauthn-options:${user.id}`, 20);
    const credentials = await this.db.webAuthnCredential.findMany({ where: { userId: user.id, profile: 'B', state: 'ACTIVE', rpId: this.rpId } });
    if (!credentials.length) throw invalid();
    const options = await this.adapter.authenticationOptions({ rpID: this.rpId, timeout: ttl, userVerification: 'required',
      allowCredentials: credentials.map(c => ({ id: c.credentialId, transports: c.transports })) });
    const updated = await this.db.authTransaction.updateMany({ where: { id: value.id, version: value.version, state: value.state, expiresAt: { gt: new Date() } },
      data: { challenge: options.challenge, version: { increment: 1 } } });
    if (updated.count !== 1) throw invalid();
    return { options, expiresAt: value.expiresAt };
  }
  async bVerify(raw: string | undefined, response: AuthenticationResponseJSON) {
    this.requireEnabled(); const value = await this.pending(raw, 'B');
    if (value.state !== 'PENDING_YUBIKEY' || !value.passwordVerifiedAt) throw invalid();
    await this.reserve(value);
    const { credential, info } = await this.verifyAssertion(value, response);
    const sessionToken = token();
    await this.db.$transaction(async tx => {
      const user = await this.policy.lockUser(tx, credential.userId);
      if (user.securityVersion !== value.securityVersion || !user.allowedModes.includes('B')) throw invalid();
      await this.advanceCredential(tx, credential, info.newCounter);
      await this.consume(tx, value, 'CONSUMED', { credentialId: credential.id, webauthnVerifiedAt: new Date() });
      if (value.oldSessionHash) await tx.session.deleteMany({ where: { tokenHash: value.oldSessionHash } });
      await tx.session.create({ data: { tokenHash: digest(sessionToken), ...this.policy.sessionData(user, 'B', ['password', 'webauthn'],
        { credentialId: credential.id, sourceTransactionId: value.id }) } });
      await audit(tx, user.id, 'login.completed', { mode: 'B', credentialId: credential.id });
    });
    return { sessionToken, user: await this.auth.me(sessionToken) };
  }
  async cOptions(rawSession: string | undefined, purpose: string, ip: string, oldPending?: string) {
    this.requireEnabled('C_LOGIN');
    if (!['LOGIN', 'C_ACTIVATION'].includes(purpose)) throw new BadRequestException('Neplatný účel.');
    await this.auth.limit(`c-start:${ip}`, 30);
    const session = purpose === 'C_ACTIVATION' ? await this.policy.fresh(rawSession) : null;
    const options = await this.adapter.authenticationOptions({ rpID: this.rpId, timeout: ttl, userVerification: 'required' });
    const pendingToken = token(); const expiresAt = expiry();
    await this.db.$transaction(async tx => {
      if (session) { await this.policy.lockUser(tx, session.userId); await this.policy.fresh(rawSession, tx); }
      await this.cancelPrevious(tx, oldPending);
      await tx.authTransaction.create({ data: { tokenHash: digest(pendingToken), mode: 'C', purpose, state: 'PENDING_YUBIKEY',
        challenge: options.challenge, expiresAt, userId: session?.userId, sourceSessionHash: session?.tokenHash,
        securityVersion: session?.securityVersion, oldSessionHash: rawSession ? digest(rawSession) : null } });
    });
    return { pendingToken, options, expiresAt };
  }
  async cVerify(raw: string | undefined, rawSession: string | undefined, response: AuthenticationResponseJSON) {
    this.requireEnabled('C_LOGIN'); const value = await this.pending(raw, 'C');
    if (value.state !== 'PENDING_YUBIKEY') throw invalid();
    await this.reserve(value);
    const { credential, info } = await this.verifyAssertion(value, response, 'ACTIVE', true);
    const capability = token(); const expiresAt = expiry();
    await this.db.$transaction(async tx => {
      const user = await this.policy.lockUser(tx, credential.userId);
      if (value.purpose === 'LOGIN' && !user.allowedModes.includes('C')) throw invalid();
      if (value.purpose === 'C_ACTIVATION') {
        const session = await this.policy.fresh(rawSession, tx);
        if (value.sourceSessionHash !== session.tokenHash || session.userId !== user.id || value.securityVersion !== user.securityVersion) throw invalid();
      }
      if (!await tx.mobileDevice.count({ where: { userId: user.id, status: 'ACTIVE', trustLevel: 'HARDWARE_ATTESTED' } })) throw invalid();
      await this.advanceCredential(tx, credential, info.newCounter);
      await this.consume(tx, value, 'PENDING_MOBILE', { userId: user.id, credentialId: credential.id,
        securityVersion: user.securityVersion, webauthnVerifiedAt: new Date(), mobileChallenge: token(), mobileTokenHash: digest(capability), expiresAt });
    });
    return { state: 'PENDING_MOBILE', transactionId: value.id, capability, expiresAt };
  }
  async list(raw: string | undefined) {
    const session = await this.policy.current(raw);
    const credentials = await this.db.webAuthnCredential.findMany({ where: { userId: session.userId }, orderBy: { createdAt: 'asc' },
      select: { id: true, profile: true, state: true, createdAt: true, proofAt: true } });
    return { credentials };
  }
  async revoke(raw: string | undefined, id: string, grant: string) {
    const session = await this.policy.fresh(raw);
    await this.db.$transaction(async tx => {
      const user = await this.policy.lockUser(tx, session.userId);
      await this.policy.consumeGrant(tx, raw, grant, 'REVOKE');
      const credential = await tx.webAuthnCredential.findUnique({ where: { id } });
      if (!credential || credential.userId !== user.id || credential.state === 'REVOKED') throw invalid();
      if (user.allowedModes.includes(credential.profile) && await tx.webAuthnCredential.count({ where: {
        userId: user.id, profile: credential.profile, state: 'ACTIVE', id: { not: id } } }) === 0) {
        throw new ConflictException('Najprv pripravte náhradný kľúč alebo vykonajte riadenú obnovu.');
      }
      await tx.webAuthnCredential.update({ where: { id }, data: { state: 'REVOKED', revokedAt: new Date(), version: { increment: 1 } } });
      await tx.user.update({ where: { id: user.id }, data: { securityVersion: { increment: 1 } } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.authTransaction.updateMany({ where: { userId: user.id, state: { notIn: ['CONSUMED', 'REJECTED', 'CANCELLED'] } }, data: { state: 'CANCELLED', version: { increment: 1 } } });
      await audit(tx, user.id, 'credential.revoked', { credentialId: id });
    });
    return { revoked: true };
  }
  async setPolicy(raw: string | undefined, modes: string[], grant: string, activationProofId?: string) {
    const session = await this.policy.fresh(raw);
    if (!modes.length || modes.length > 3 || new Set(modes).size !== modes.length || modes.some(m => !['A', 'B', 'C'].includes(m))) throw new BadRequestException('Neplatné režimy.');
    // C cannot be downgraded through self-service factor management.
    if (session.user.allowedModes.includes('C') && modes.some(m => !session.user.allowedModes.includes(m))) throw new ConflictException('Zníženie politiky vyžaduje riadený postup obnovy.');
    await this.db.$transaction(async tx => {
      const user = await this.policy.lockUser(tx, session.userId);
      await this.policy.consumeGrant(tx, raw, grant, 'POLICY');
      for (const mode of modes) {
        if (mode === 'B' || mode === 'C') {
          this.requireEnabled(mode === 'C' ? 'C_LOGIN' : 'B');
          if (!await tx.webAuthnCredential.count({ where: { userId: user.id, profile: mode, state: 'ACTIVE', attestationVerified: true } })) throw invalid();
        }
      }
      if (modes.includes('C') && !user.allowedModes.includes('C')) {
        if (!activationProofId || !uuidPattern.test(activationProofId)) throw invalid();
        const proof = await tx.authTransaction.findUnique({ where: { id: activationProofId } });
        if (!proof || proof.purpose !== 'C_ACTIVATION' || proof.state !== 'VERIFIED_C' || !isLive(proof) ||
          proof.sourceSessionHash !== session.tokenHash || proof.userId !== user.id || proof.securityVersion !== user.securityVersion ||
          !proof.webauthnVerifiedAt || !proof.mobileVerifiedAt || !proof.deviceId || !proof.credentialId) throw invalid();
        if (!await tx.mobileDevice.count({ where: { id: proof.deviceId, userId: user.id, status: 'ACTIVE', trustLevel: 'HARDWARE_ATTESTED' } })) throw invalid();
        await this.consume(tx, proof, 'CONSUMED');
      }
      await tx.user.update({ where: { id: user.id }, data: { allowedModes: modes, securityVersion: { increment: 1 } } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.pending.deleteMany({ where: { userId: user.id } });
      await tx.authTransaction.updateMany({ where: { userId: user.id, state: { notIn: ['CONSUMED', 'REJECTED', 'CANCELLED'] } }, data: { state: 'CANCELLED', version: { increment: 1 } } });
      await audit(tx, user.id, 'policy.changed', { allowedModes: modes.join(',') });
    });
    return { allowedModes: modes, reauthenticationRequired: true };
  }
}
