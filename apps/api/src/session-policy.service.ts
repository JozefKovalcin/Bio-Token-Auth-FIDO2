import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { Database } from './database.js';
import { digest, token } from './crypto.js';

export const invalid = () => new UnauthorizedException('Overenie zlyhalo. Začnite overenie znova.');
export type Mode = 'A' | 'B' | 'C';
export type GrantScope = 'ENROLL' | 'REVOKE' | 'POLICY';
export const freshWindowMs = 5 * 60_000;
export const sessionLifetimeMs = 8 * 60 * 60_000;
export type Tx = Prisma.TransactionClient;

/** Authoritative session evidence; no state supplied by a client is trusted. */
@Injectable()
export class SessionPolicyService {
  constructor(private readonly db: Database) {}

  async lockUser(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id } });
    if (user.disabled) throw invalid();
    return user;
  }

  sessionData(user: User, mode: Mode, factors: string[], extra: {
    credentialId?: string; deviceId?: string; sourceTransactionId?: string;
  } = {}) {
    if (user.disabled || !user.allowedModes.includes(mode)) throw invalid();
    return { userId: user.id, mode, factors, authTime: new Date(),
      securityVersion: user.securityVersion, expiresAt: new Date(Date.now() + sessionLifetimeMs), ...extra };
  }

  async current(raw?: string, client: Database | Tx = this.db) {
    if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) throw invalid();
    return this.currentHash(digest(raw), client);
  }

  async currentHash(hash: string, client: Database | Tx = this.db, requireFresh = false) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw invalid();
    const session = await client.session.findUnique({ where: { tokenHash: hash }, include: { user: true } });
    if (!session || session.user.disabled || session.expiresAt <= new Date() || session.securityVersion !== session.user.securityVersion ||
      !session.user.allowedModes.includes(session.mode)) throw invalid();
    const expected: Record<string, string[]> = { A: ['password'], B: ['password', 'webauthn'], C: ['webauthn', 'mobile'] };
    if (!expected[session.mode]?.every(factor => session.factors.includes(factor))) throw invalid();
    if (session.mode !== 'A') {
      const credential = session.credentialId && await client.webAuthnCredential.findUnique({ where: { id: session.credentialId } });
      if (!credential || credential.userId !== session.userId || credential.state !== 'ACTIVE' || credential.profile !== session.mode) throw invalid();
    }
    if (session.mode === 'C') {
      const device = session.deviceId && await client.mobileDevice.findUnique({ where: { id: session.deviceId } });
      if (!device || device.userId !== session.userId || device.status !== 'ACTIVE') throw invalid();
    }
    if (requireFresh && (Date.now() - session.authTime.getTime() > freshWindowMs ||
      (session.mode === 'A' && session.user.totpActive && !session.factors.includes('totp')) ||
      (session.user.allowedModes.includes('C') && session.mode !== 'C'))) throw invalid();
    return session;
  }

  async fresh(raw?: string, client: Database | Tx = this.db) {
    const session = await this.current(raw, client);
    if (Date.now() - session.authTime.getTime() > freshWindowMs ||
      (session.mode === 'A' && session.user.totpActive && !session.factors.includes('totp')) ||
      (session.user.allowedModes.includes('C') && session.mode !== 'C')) throw invalid();
    return session;
  }

  publicSession(session: Awaited<ReturnType<SessionPolicyService['current']>>) {
    return { username: session.user.username, mode: session.mode, totpActive: session.user.totpActive,
      expiresAt: session.expiresAt, authTime: session.authTime, factors: session.factors, allowedModes: session.user.allowedModes };
  }

  async issueGrant(raw: string | undefined, scope: string) {
    if (!['ENROLL', 'REVOKE', 'POLICY'].includes(scope)) throw new BadRequestException('Neplatný účel overenia.');
    const session = await this.fresh(raw);
    const grant = token(); const expiresAt = new Date(Date.now() + freshWindowMs);
    await this.db.$transaction(async tx => {
      await this.lockUser(tx, session.userId);
      await this.fresh(raw, tx);
      await tx.reauthGrant.create({ data: { tokenHash: digest(grant), sessionHash: session.tokenHash,
        userId: session.userId, scope, securityVersion: session.securityVersion, expiresAt } });
    });
    return { grant, expiresAt, scope };
  }

  async consumeGrant(tx: Tx, rawSession: string | undefined, rawGrant: string, scope: GrantScope) {
    const session = await this.fresh(rawSession, tx);
    const result = await tx.reauthGrant.updateMany({ where: { tokenHash: digest(rawGrant), scope,
      sessionHash: session.tokenHash, userId: session.userId, securityVersion: session.user.securityVersion,
      consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (result.count !== 1) throw invalid();
    return session;
  }
}
