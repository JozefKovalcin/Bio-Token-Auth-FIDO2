import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import type { AuthTransaction, MobileChallenge, MobileDevice, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Database } from './database.js';
import { AuthService } from './auth.service.js';
import { SessionPolicyService, type Tx } from './session-policy.service.js';
import { digest, token } from './crypto.js';
import { MobileAttestationVerifier, type MobileAttestationInput } from './mobile.attestation.js';
import { mobileKeyFingerprint, mobilePublicJwk, mobileSigningInput, verifyMobileJws } from './mobile.crypto.js';
import { audit } from './audit.js';

const invalid = () => new UnauthorizedException('Mobilné overenie zlyhalo. Začnite znova.');
const conflict = () => new ConflictException('Požiadavka už nie je platná. Začnite znova.');
const expiry = (maximum: Date, ms = 60_000) => new Date(Math.min(maximum.getTime(), Date.now() + ms));
const publicDevice = (device: MobileDevice) => ({ id: device.id, label: device.label, status: device.status, createdAt: device.createdAt });

@Injectable()
export class MobileService {
  constructor(private readonly db: Database, private readonly policy: SessionPolicyService,
    private readonly auth: AuthService, private readonly attestation: MobileAttestationVerifier) {}

  async startPairing(raw: string | undefined, proofId: string, grant: string) {
    this.attestation.assertEnabled();
    const session = await this.policy.fresh(raw);
    await this.auth.limit(`pairing:${session.userId}`, 10);
    const pairingToken = token();
    const result = await this.db.$transaction(async tx => {
      const user = await this.policy.lockUser(tx, session.userId);
      const current = await this.policy.consumeGrant(tx, raw, grant, 'ENROLL');
      if (user.allowedModes.includes('C') && current.mode !== 'C') throw invalid();
      const proof = await tx.authTransaction.findUnique({ where: { id: proofId } });
      if (!proof || proof.userId !== user.id || proof.sourceSessionHash !== session.tokenHash || proof.mode !== 'C'
        || proof.purpose !== 'PAIRING' || proof.state !== 'VERIFIED_YUBIKEY' || proof.expiresAt <= new Date()
        || proof.securityVersion !== user.securityVersion || !proof.webauthnVerifiedAt || !proof.credentialId) throw invalid();
      const credential = await tx.webAuthnCredential.findUnique({ where: { id: proof.credentialId } });
      if (!credential || credential.userId !== user.id || credential.profile !== 'C' || credential.state !== 'ACTIVE') throw invalid();
      const used = await tx.authTransaction.updateMany({ where: { id: proof.id, state: 'VERIFIED_YUBIKEY', version: proof.version }, data: { state: 'CONSUMED', version: { increment: 1 } } });
      if (used.count !== 1) throw conflict();
      await tx.pairingRequest.updateMany({ where: { browserSessionHash: session.tokenHash, status: { in: ['PENDING', 'CANDIDATE', 'AWAITING_PC_CONFIRMATION'] } }, data: { status: 'CANCELLED' } });
      const pairing = await tx.pairingRequest.create({ data: { userId: user.id, browserSessionHash: session.tokenHash,
        tokenHash: digest(pairingToken), challenge: token(), securityVersion: user.securityVersion,
        expiresAt: new Date(Date.now() + 5 * 60_000) } });
      await audit(tx, user.id, 'pairing.started', { credentialId: credential.id });
      return pairing;
    });
    return { pairingId: result.id, pairingToken, expiresAt: result.expiresAt,
      qr: { v: 1, type: 'pairing', token: pairingToken, origin: process.env.APP_ORIGIN } };
  }

  private async pairing(raw: string, client: Database | Tx = this.db) {
    const pairing = await client.pairingRequest.findUnique({ where: { tokenHash: digest(raw) }, include: { user: true } });
    if (!pairing || pairing.user.disabled || pairing.expiresAt <= new Date() || pairing.securityVersion !== pairing.user.securityVersion
      || !['PENDING', 'CANDIDATE', 'AWAITING_PC_CONFIRMATION'].includes(pairing.status)) throw invalid();
    return pairing;
  }

  async resolvePairing(raw: string, ip: string) {
    this.attestation.assertEnabled();
    await this.auth.limit(`pairing-resolve-ip:${ip}`, 30);
    const pairing = await this.pairing(raw);
    return { pairingId: pairing.id, attestationChallenge: pairing.challenge, expiresAt: pairing.expiresAt, serviceOrigin: process.env.APP_ORIGIN };
  }

  async candidate(raw: string, body: Omit<MobileAttestationInput, 'challenge'> & { label: string }, ip: string) {
    this.attestation.assertEnabled();
    await this.auth.limit(`pairing-candidate-ip:${ip}`, 20);
    const pairing = await this.pairing(raw);
    if (pairing.status !== 'PENDING') throw conflict();
    await this.auth.limit(`pairing-candidate:${pairing.userId}`, 10);
    const approvalPublicJwk = mobilePublicJwk(body.approvalPublicJwk);
    const authPublicJwk = mobilePublicJwk(body.authPublicJwk);
    const [approvalFingerprint, authFingerprint] = await Promise.all([mobileKeyFingerprint(approvalPublicJwk), mobileKeyFingerprint(authPublicJwk)]);
    if (approvalFingerprint === authFingerprint) throw invalid();
    // This can access the CRL network and must run BEFORE any database transaction/lock.
    const trust = await this.attestation.verify({ challenge: pairing.challenge, approvalPublicJwk, authPublicJwk,
      approvalAttestation: body.approvalAttestation, authAttestation: body.authAttestation });
    const deviceId = randomUUID();
    const confirmationCode = `${approvalFingerprint.slice(0, 8)}-${authFingerprint.slice(0, 8)}`;
    const expiresAt = expiry(pairing.expiresAt, 120_000);
    const signingInput = mobileSigningInput('PAIRING_PROOF', expiresAt, { pairingId: pairing.id, accountId: pairing.userId,
      deviceId, approvalFingerprint, authFingerprint, browserBinding: digest(pairing.browserSessionHash) });
    const challenge = await this.db.$transaction(async tx => {
      await this.policy.lockUser(tx, pairing.userId);
      const current = await this.pairing(raw, tx);
      if (current.status !== 'PENDING') throw conflict();
      await tx.mobileDevice.create({ data: { id: deviceId, userId: pairing.userId, approvalPublicJwk, authPublicJwk,
        trustLevel: trust.trustLevel, trustEvidence: trust.evidence, label: body.label } });
      const changed = await tx.pairingRequest.updateMany({ where: { id: pairing.id, status: 'PENDING' }, data: { status: 'CANDIDATE', pendingDeviceId: deviceId, confirmationCode } });
      if (changed.count !== 1) throw conflict();
      return tx.mobileChallenge.create({ data: { deviceId, pairingId: pairing.id, purpose: 'PAIRING_PROOF', signingInput, expiresAt } });
    });
    return { deviceId, challengeId: challenge.id, signingInput, confirmationCode, expiresAt };
  }

  async provePairing(raw: string, challengeId: string, approvalJws: string, authJws: string) {
    this.attestation.assertEnabled();
    const pairing = await this.pairing(raw);
    const { challenge, device } = await this.challenge(challengeId, 'PAIRING_PROOF', false);
    await this.auth.limit(`mobile-proof:${device.id}`, 30);
    if (challenge.pairingId !== pairing.id || device.id !== pairing.pendingDeviceId) throw invalid();
    await Promise.all([verifyMobileJws(approvalJws, challenge.signingInput, device.approvalPublicJwk), verifyMobileJws(authJws, challenge.signingInput, device.authPublicJwk)]);
    await this.db.$transaction(async tx => {
      await this.policy.lockUser(tx, pairing.userId);
      const current = await this.pairing(raw, tx);
      if (current.status !== 'CANDIDATE' || current.pendingDeviceId !== device.id) throw conflict();
      await this.consumeChallenge(tx, challenge, device);
      const changed = await tx.pairingRequest.updateMany({ where: { id: pairing.id, status: 'CANDIDATE', pendingDeviceId: device.id }, data: { status: 'AWAITING_PC_CONFIRMATION' } });
      if (changed.count !== 1) throw conflict();
      await tx.mobileDevice.update({ where: { id: device.id }, data: { status: 'AWAITING_PC_CONFIRMATION', version: { increment: 1 } } });
    });
    return { deviceId: device.id, confirmationCode: pairing.confirmationCode, status: 'AWAITING_PC_CONFIRMATION' };
  }

  async pairingStatus(raw: string | undefined, id: string) {
    const session = await this.policy.fresh(raw);
    const pairing = await this.db.pairingRequest.findUnique({ where: { id } });
    if (!pairing || pairing.userId !== session.userId || pairing.browserSessionHash !== session.tokenHash) throw invalid();
    const candidate = pairing.pendingDeviceId && await this.db.mobileDevice.findUnique({ where: { id: pairing.pendingDeviceId } });
    return { pairingId: id, status: pairing.expiresAt <= new Date() ? 'EXPIRED' : pairing.status, expiresAt: pairing.expiresAt,
      ...(candidate && pairing.status === 'AWAITING_PC_CONFIRMATION' ? { candidate: { deviceId: candidate.id, label: candidate.label, confirmationCode: pairing.confirmationCode } } : {}) };
  }

  async confirmPairing(raw: string | undefined, id: string, deviceId: string, confirmationCode: string) {
    this.attestation.assertEnabled();
    const session = await this.policy.fresh(raw);
    await this.db.$transaction(async tx => {
      const user = await this.policy.lockUser(tx, session.userId);
      const current = await this.policy.fresh(raw, tx);
      if (user.allowedModes.includes('C') && current.mode !== 'C') throw invalid();
      const pairing = await tx.pairingRequest.findUnique({ where: { id } });
      if (!pairing || pairing.userId !== user.id || pairing.browserSessionHash !== session.tokenHash || pairing.securityVersion !== user.securityVersion
        || pairing.expiresAt <= new Date() || pairing.status !== 'AWAITING_PC_CONFIRMATION' || pairing.pendingDeviceId !== deviceId || pairing.confirmationCode !== confirmationCode) throw invalid();
      const changed = await tx.pairingRequest.updateMany({ where: { id, status: 'AWAITING_PC_CONFIRMATION' }, data: { status: 'CONFIRMED' } });
      const device = await tx.mobileDevice.updateMany({ where: { id: deviceId, userId: user.id, status: 'AWAITING_PC_CONFIRMATION', trustLevel: 'HARDWARE_ATTESTED' }, data: { status: 'ACTIVE', version: { increment: 1 } } });
      if (changed.count !== 1 || device.count !== 1) throw conflict();
      await audit(tx, user.id, 'pairing.confirmed', { deviceId });
    });
    return { status: 'CONFIRMED', deviceId };
  }

  async devices(raw: string | undefined) {
    const session = await this.policy.current(raw);
    return (await this.db.mobileDevice.findMany({ where: { userId: session.userId }, orderBy: { createdAt: 'desc' } })).map(publicDevice);
  }

  async revoke(raw: string | undefined, deviceId: string, grant: string) {
    const session = await this.policy.fresh(raw);
    await this.db.$transaction(async tx => {
      const user = await this.policy.lockUser(tx, session.userId);
      await this.policy.consumeGrant(tx, raw, grant, 'REVOKE');
      const changed = await tx.mobileDevice.updateMany({ where: { id: deviceId, userId: user.id, status: { not: 'REVOKED' } }, data: { status: 'REVOKED', revokedAt: new Date(), version: { increment: 1 } } });
      if (changed.count !== 1) throw invalid();
      if (user.allowedModes.includes('C') && await tx.mobileDevice.count({ where: { userId: user.id, status: 'ACTIVE' } }) === 0) throw new ConflictException('Najprv spárujte záložný telefón alebo použite kontrolovanú obnovu.');
      // A single account lock serializes revocation against all approvals and completions.
      await tx.user.update({ where: { id: user.id }, data: { securityVersion: { increment: 1 } } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.authTransaction.updateMany({ where: { userId: user.id, state: { notIn: ['CONSUMED', 'CANCELLED', 'REJECTED', 'EXPIRED'] } }, data: { state: 'CANCELLED', version: { increment: 1 } } });
      await tx.pairingRequest.updateMany({ where: { userId: user.id, status: { notIn: ['CONFIRMED', 'CANCELLED'] } }, data: { status: 'CANCELLED' } });
      await audit(tx, user.id, 'device.revoked', { deviceId });
    });
    return { revoked: true };
  }

  private async challenge(id: string, purpose: string, active = true) {
    const challenge = await this.db.mobileChallenge.findUnique({ where: { id } });
    if (!challenge || challenge.purpose !== purpose || challenge.consumedAt || challenge.expiresAt <= new Date() || !challenge.deviceId) throw invalid();
    const device = await this.db.mobileDevice.findUnique({ where: { id: challenge.deviceId } });
    if (!device || device.status === 'REVOKED' || (active && device.status !== 'ACTIVE') || device.trustLevel !== 'HARDWARE_ATTESTED') throw invalid();
    const user = await this.db.user.findUnique({ where: { id: device.userId }, select: { disabled: true } });
    if (!user || user.disabled) throw invalid();
    return { challenge, device };
  }

  private async consumeChallenge(tx: Tx, challenge: MobileChallenge, device: MobileDevice) {
    const current = await tx.mobileDevice.findUnique({ where: { id: device.id } });
    if (!current || current.version !== device.version || current.status !== device.status || current.status === 'REVOKED') throw invalid();
    const changed = await tx.mobileChallenge.updateMany({ where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() }, signingInput: challenge.signingInput, purpose: challenge.purpose }, data: { consumedAt: new Date() } });
    if (changed.count !== 1) throw conflict();
  }

  private async loginContext(tx: Database | Tx, transaction: AuthTransaction) {
    if (!transaction.userId || transaction.mode !== 'C' || !['LOGIN', 'C_ACTIVATION'].includes(transaction.purpose)
      || transaction.expiresAt <= new Date() || !transaction.webauthnVerifiedAt || !transaction.credentialId) throw invalid();
    const user = await tx.user.findUnique({ where: { id: transaction.userId } });
    const credential = await tx.webAuthnCredential.findUnique({ where: { id: transaction.credentialId } });
    if (!user || user.disabled || transaction.securityVersion !== user.securityVersion || !credential || credential.userId !== user.id || credential.profile !== 'C' || credential.state !== 'ACTIVE') throw invalid();
    if (transaction.purpose === 'LOGIN') {
      if (!user.allowedModes.includes('C')) throw invalid();
    } else {
      if (!transaction.sourceSessionHash) throw invalid();
      const source = await this.policy.currentHash(transaction.sourceSessionHash, tx, true);
      if (source.userId !== user.id || source.securityVersion !== user.securityVersion) throw invalid();
    }
    return user;
  }

  async authChallenge(deviceId: string, transactionToken: string, operation: 'resolve' | 'reject', ip: string) {
    this.attestation.assertEnabled();
    await this.auth.limit(`mobile-challenge-ip:${ip}`, 60);
    await this.auth.limit(`mobile-challenge-device:${deviceId}`, 30);
    const [device, transaction] = await Promise.all([
      this.db.mobileDevice.findUnique({ where: { id: deviceId } }),
      this.db.authTransaction.findUnique({ where: { mobileTokenHash: digest(transactionToken) } }),
    ]);
    if (!device || device.status !== 'ACTIVE' || !transaction || transaction.state !== 'PENDING_MOBILE' || transaction.userId !== device.userId) throw invalid();
    await this.loginContext(this.db, transaction);
    const expiresAt = expiry(transaction.expiresAt);
    const purpose = operation === 'resolve' ? 'LOGIN_RESOLVE' : 'LOGIN_REJECT';
    const signingInput = mobileSigningInput(purpose, expiresAt, { accountId: device.userId, deviceId, transactionId: transaction.id,
      request: { method: 'POST', path: `/api/mobile/auth/${operation}`, transactionTokenHash: digest(transactionToken) } });
    const challenge = await this.db.mobileChallenge.create({ data: { deviceId, transactionId: transaction.id, purpose, signingInput, expiresAt } });
    return { challengeId: challenge.id, signingInput, expiresAt };
  }

  async resolve(challengeId: string, proofJws: string) {
    this.attestation.assertEnabled();
    const { challenge, device } = await this.challenge(challengeId, 'LOGIN_RESOLVE');
    await this.auth.limit(`mobile-proof:${device.id}`, 30);
    await verifyMobileJws(proofJws, challenge.signingInput, device.authPublicJwk);
    return this.db.$transaction(async tx => {
      await this.policy.lockUser(tx, device.userId);
      await this.consumeChallenge(tx, challenge, device);
      const transaction = challenge.transactionId && await tx.authTransaction.findUnique({ where: { id: challenge.transactionId } });
      if (!transaction || transaction.state !== 'PENDING_MOBILE') throw conflict();
      const user = await this.loginContext(tx, transaction);
      const expiresAt = expiry(transaction.expiresAt, 120_000);
      const signingInput = mobileSigningInput('LOGIN_APPROVE', expiresAt, { accountId: user.id, username: user.username, deviceId: device.id,
        transactionId: transaction.id, browserBinding: digest(transaction.tokenHash), transactionNonce: transaction.mobileChallenge });
      const approval = await tx.mobileChallenge.create({ data: { deviceId: device.id, transactionId: transaction.id, purpose: 'LOGIN_APPROVE', signingInput, expiresAt } });
      return { transactionId: transaction.id, username: user.username, serviceOrigin: process.env.APP_ORIGIN,
        expiresAt, challengeId: approval.id, signingInput };
    });
  }

  async decide(challengeId: string, jws: string, approve: boolean) {
    this.attestation.assertEnabled();
    const purpose = approve ? 'LOGIN_APPROVE' : 'LOGIN_REJECT';
    const { challenge, device } = await this.challenge(challengeId, purpose);
    await this.auth.limit(`mobile-proof:${device.id}`, 30);
    await verifyMobileJws(jws, challenge.signingInput, approve ? device.approvalPublicJwk : device.authPublicJwk);
    if (approve) await this.attestation.checkTrust(device.trustEvidence);
    await this.db.$transaction(async tx => {
      await this.policy.lockUser(tx, device.userId);
      await this.consumeChallenge(tx, challenge, device);
      const transaction = challenge.transactionId && await tx.authTransaction.findUnique({ where: { id: challenge.transactionId } });
      if (!transaction || transaction.state !== 'PENDING_MOBILE' || transaction.userId !== device.userId) throw conflict();
      await this.loginContext(tx, transaction);
      const changed = await tx.authTransaction.updateMany({ where: { id: transaction.id, state: 'PENDING_MOBILE', version: transaction.version }, data: {
        state: approve ? 'APPROVED' : 'REJECTED', deviceId: device.id, mobileVerifiedAt: approve ? new Date() : undefined, version: { increment: 1 },
      } });
      if (changed.count !== 1) throw conflict();
      await audit(tx, device.userId, approve ? 'login.mobile_approved' : 'login.mobile_rejected', { deviceId: device.id, mode: 'C' });
    });
    return { status: approve ? 'APPROVED' : 'REJECTED' };
  }

  async deviceChallenge(deviceId: string, ip: string) {
    this.attestation.assertEnabled();
    await this.auth.limit(`mobile-status-ip:${ip}`, 60);
    const device = await this.db.mobileDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw invalid();
    const user = await this.db.user.findUnique({ where: { id: device.userId }, select: { disabled: true } });
    if (!user || user.disabled) throw invalid();
    const expiresAt = new Date(Date.now() + 60_000);
    const signingInput = mobileSigningInput('DEVICE_STATUS', expiresAt, { deviceId, request: { method: 'POST', path: '/api/mobile/devices/status' } });
    const challenge = await this.db.mobileChallenge.create({ data: { deviceId, purpose: 'DEVICE_STATUS', signingInput, expiresAt } });
    return { challengeId: challenge.id, signingInput, expiresAt };
  }

  async deviceStatus(challengeId: string, proofJws: string) {
    this.attestation.assertEnabled();
    const challenge = await this.db.mobileChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge || challenge.purpose !== 'DEVICE_STATUS' || challenge.consumedAt || challenge.expiresAt <= new Date() || !challenge.deviceId) throw invalid();
    const device = await this.db.mobileDevice.findUnique({ where: { id: challenge.deviceId } });
    if (!device) throw invalid();
    const user = await this.db.user.findUnique({ where: { id: device.userId }, select: { disabled: true } });
    if (!user || user.disabled) throw invalid();
    await this.auth.limit(`mobile-proof:${device.id}`, 30);
    await verifyMobileJws(proofJws, challenge.signingInput, device.authPublicJwk);
    const changed = await this.db.mobileChallenge.updateMany({ where: { id: challenge.id, purpose: 'DEVICE_STATUS', consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (changed.count !== 1) throw conflict();
    return { deviceId: device.id, status: device.status };
  }

  private async browserTransaction(raw?: string, client: Database | Tx = this.db) {
    if (!raw) throw invalid();
    const transaction = await client.authTransaction.findUnique({ where: { tokenHash: digest(raw) } });
    if (!transaction || transaction.mode !== 'C' || !['LOGIN', 'C_ACTIVATION'].includes(transaction.purpose)) throw invalid();
    return transaction;
  }

  async status(raw?: string, expectedId?: string) {
    this.attestation.assertEnabled();
    const transaction = await this.browserTransaction(raw);
    if (expectedId && transaction.id !== expectedId) throw invalid();
    if (transaction.expiresAt <= new Date()) return { state: 'EXPIRED', expiresAt: transaction.expiresAt };
    if (transaction.userId && !['CONSUMED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(transaction.state)) await this.loginContext(this.db, transaction);
    return { state: transaction.state, expiresAt: transaction.expiresAt };
  }

  async complete(raw: string | undefined, oldSession?: string, expectedId?: string) {
    this.attestation.assertEnabled();
    const transaction = await this.browserTransaction(raw);
    if (expectedId && transaction.id !== expectedId) throw invalid();
    if (!transaction.userId) throw invalid();
    if (transaction.state !== 'APPROVED' || !transaction.deviceId) throw conflict();
    const verifiedDevice = await this.db.mobileDevice.findUnique({ where: { id: transaction.deviceId } });
    if (!verifiedDevice || verifiedDevice.status !== 'ACTIVE') throw invalid();
    // External CRL access is outside the finalization transaction. Recheck the device version inside.
    await this.attestation.checkTrust(verifiedDevice.trustEvidence, true);
    const sessionToken = token();
    return this.db.$transaction(async tx => {
      await this.policy.lockUser(tx, transaction.userId!);
      const current = await this.browserTransaction(raw, tx);
      if (current.state !== 'APPROVED' || !current.mobileVerifiedAt || !current.deviceId) throw conflict();
      const user = await this.loginContext(tx, current);
      const device = await tx.mobileDevice.findUnique({ where: { id: current.deviceId } });
      if (!device || device.version !== verifiedDevice.version || device.userId !== user.id || device.status !== 'ACTIVE' || device.trustLevel !== 'HARDWARE_ATTESTED') throw invalid();
      const changed = await tx.authTransaction.updateMany({ where: { id: current.id, state: 'APPROVED', version: current.version, expiresAt: { gt: new Date() } }, data: {
        state: current.purpose === 'C_ACTIVATION' ? 'VERIFIED_C' : 'CONSUMED', version: { increment: 1 },
      } });
      if (changed.count !== 1) throw conflict();
      if (current.purpose === 'C_ACTIVATION') {
        await audit(tx, user.id, 'policy.c_trial_verified', { deviceId: device.id, credentialId: current.credentialId!, mode: 'C' });
        return { activationProofId: current.id, verified: true as const };
      }
      if (oldSession) await tx.session.deleteMany({ where: { tokenHash: digest(oldSession) } });
      if (current.oldSessionHash) await tx.session.deleteMany({ where: { tokenHash: current.oldSessionHash } });
      const session = await tx.session.create({ data: { tokenHash: digest(sessionToken), ...this.policy.sessionData(user, 'C', ['webauthn', 'mobile'],
        { credentialId: current.credentialId!, deviceId: device.id, sourceTransactionId: current.id }) } });
      await audit(tx, user.id, 'login.completed', { mode: 'C', deviceId: device.id, credentialId: current.credentialId! });
      return { sessionToken, username: user.username, mode: 'C' as const, totpActive: user.totpActive, expiresAt: session.expiresAt,
        factors: session.factors, allowedModes: user.allowedModes, authTime: session.authTime };
    });
  }

  async cancel(raw?: string, expectedId?: string) {
    const transaction = await this.browserTransaction(raw);
    if (expectedId && transaction.id !== expectedId) throw invalid();
    const perform = async (tx: Tx) => tx.authTransaction.updateMany({ where: { id: transaction.id,
      state: { in: ['PENDING_YUBIKEY', 'PENDING_MOBILE', 'APPROVED'] } }, data: { state: 'CANCELLED', version: { increment: 1 } } });
    await this.db.$transaction(async tx => { if (transaction.userId) await this.policy.lockUser(tx, transaction.userId); await perform(tx); });
    return { cancelled: true };
  }
}
