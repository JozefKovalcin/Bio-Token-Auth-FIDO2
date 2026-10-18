import { Injectable, UnauthorizedException, HttpException, ConflictException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { Database } from './database.js';
import { decrypt, digest, encrypt, token } from './crypto.js';

const invalid = () => new UnauthorizedException('Overenie zlyhalo. Skontrolujte údaje alebo začnite znova.');
export const passwordOptions = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };

@Injectable()
export class AuthService {
  private dummyHash = argon2.hash(token(), passwordOptions);
  constructor(private readonly db: Database) {}

  async createUser(username: string, password: string) {
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username) || password.length < 8 || password.length > 128) {
      throw new Error('Meno: 3–64 znakov a-z/0-9/._-. Heslo: 8–128 znakov.');
    }
    const id = randomUUID();
    return this.db.user.create({ data: { id, username,
      passwordHash: await argon2.hash(password, passwordOptions),
      totpEncrypted: encrypt(generateSecret(), id) } });
  }

  async register(username: string, password: string, ip: string, oldSession?: string) {
    if (password.length < 8) throw new BadRequestException('Heslo musí mať aspoň 8 znakov.');
    await this.limit(`register-ip:${ip}`, 10);
    if (await this.db.user.findUnique({ where: { username }, select: { id: true } })) {
      throw new ConflictException('Toto používateľské meno už nie je dostupné.');
    }
    let user;
    try { user = await this.createUser(username, password); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('Toto používateľské meno už nie je dostupné.');
      }
      throw error;
    }
    const sessionToken = token();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60_000);
    await this.db.$transaction(async tx => {
      if (oldSession) await tx.session.deleteMany({ where: { tokenHash: digest(oldSession) } });
      await tx.session.create({ data: { tokenHash: digest(sessionToken), userId: user.id, expiresAt } });
    });
    return { sessionToken, user: { username, mode: 'A' as const, totpActive: false, expiresAt } };
  }

  async limit(key: string, maximum: number) {
    // A shared database counter also limits new pending sessions and multiple API processes.
    const rows = await this.db.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "expiresAt")
      VALUES (${digest(key)}, 1, NOW() + INTERVAL '5 minutes')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."expiresAt" <= NOW() THEN 1 ELSE "RateLimit"."count" + 1 END,
        "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= NOW() THEN NOW() + INTERVAL '5 minutes' ELSE "RateLimit"."expiresAt" END
      RETURNING "count"`;
    if (rows[0].count > maximum) throw new HttpException('Priveľa pokusov. Počkajte päť minút.', 429);
  }

  async password(username: string, password: string, ip: string, oldPending?: string, oldSession?: string) {
    await this.limit(`password-ip:${ip}`, 30);
    await this.limit(`password-account:${username}`, 10);
    const user = await this.db.user.findUnique({ where: { username } });
    const valid = await argon2.verify(user?.passwordHash ?? await this.dummyHash, password);
    if (!valid || !user || !user.allowedModes.includes('A')) throw invalid();
    const expiresAt = new Date(Date.now() + (user.totpActive ? 5 * 60_000 : 8 * 60 * 60_000));
    const pendingToken = user.totpActive ? token() : undefined;
    const sessionToken = user.totpActive ? undefined : token();
    await this.db.$transaction(async tx => {
      if (oldPending) await tx.pending.deleteMany({ where: { tokenHash: digest(oldPending) } });
      if (pendingToken) await tx.pending.create({ data: { tokenHash: digest(pendingToken), userId: user.id, expiresAt } });
      if (sessionToken) {
        if (oldSession) await tx.session.deleteMany({ where: { tokenHash: digest(oldSession) } });
        await tx.session.create({ data: { tokenHash: digest(sessionToken), userId: user.id, expiresAt } });
      }
    });
    if (user.totpActive) {
      return { step: 'totp' as const, pendingToken: pendingToken!, expiresAt };
    }
    return { step: 'done' as const, sessionToken: sessionToken!,
      user: { username, mode: 'A' as const, totpActive: false, expiresAt } };
  }

  async pending(raw?: string) {
    if (!raw) throw invalid();
    const pending = await this.db.pending.findUnique({ where: { tokenHash: digest(raw) }, include: { user: true } });
    if (!pending || pending.expiresAt <= new Date() || pending.attempts >= 5 || !pending.user.allowedModes.includes('A')) throw invalid();
    return pending;
  }

  async enrollment(rawSession?: string) {
    const session = await this.currentSession(rawSession);
    if (session.user.totpActive) throw new ConflictException('TOTP je už aktívne.');
    const secret = decrypt(session.user.totpEncrypted, session.user.id);
    const uri = generateURI({ issuer: 'Bio Token Auth', label: session.user.username, secret });
    return { secret, qr: await QRCode.toDataURL(uri) };
  }

  async activateTotp(rawSession: string | undefined, code: string) {
    const session = await this.currentSession(rawSession);
    await this.limit(`totp-setup:${session.userId}`, 10);
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${session.userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: session.userId } });
      if (user.totpActive) throw new ConflictException('TOTP je už aktívne.');
      const checked = await verify({ secret: decrypt(user.totpEncrypted, user.id), token: code,
        epochTolerance: 30, afterTimeStep: user.lastTotpStep < 0 ? undefined : Number(user.lastTotpStep) });
      if (!checked.valid || !('timeStep' in checked)) throw invalid();
      await tx.user.update({ where: { id: user.id }, data: { totpActive: true, lastTotpStep: BigInt(checked.timeStep) } });
    });
    return { totpActive: true };
  }

  private async currentSession(raw?: string) {
    if (!raw) throw invalid();
    const session = await this.db.session.findUnique({ where: { tokenHash: digest(raw) }, include: { user: true } });
    if (!session || session.expiresAt <= new Date() || !session.user.allowedModes.includes('A')) throw invalid();
    return session;
  }

  async totp(raw: string | undefined, code: string) {
    const pending = await this.pending(raw);
    await this.limit(`totp-account:${pending.userId}`, 10);
    // Count failures outside the completion transaction so a rollback cannot restore attempts.
    const reserved = await this.db.pending.updateMany({ where: { tokenHash: pending.tokenHash, attempts: { lt: 5 }, expiresAt: { gt: new Date() } }, data: { attempts: { increment: 1 } } });
    if (reserved.count !== 1) throw invalid();
    const sessionToken = token();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60_000);
    const result = await this.db.$transaction(async tx => {
      // Serialize all completions for the account, including different browser transactions.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${pending.userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: pending.userId } });
      if (!user.allowedModes.includes('A') || !user.totpActive) throw invalid();
      const checked = await verify({ secret: decrypt(user.totpEncrypted, user.id), token: code,
        epochTolerance: 30, afterTimeStep: user.lastTotpStep < 0 ? undefined : Number(user.lastTotpStep) });
      if (!checked.valid || !('timeStep' in checked)) throw invalid();
      const consumed = await tx.pending.deleteMany({ where: { tokenHash: pending.tokenHash, expiresAt: { gt: new Date() } } });
      if (consumed.count !== 1) throw invalid();
      await tx.user.update({ where: { id: user.id }, data: { totpActive: true, lastTotpStep: BigInt(checked.timeStep) } });
      await tx.session.create({ data: { tokenHash: digest(sessionToken), userId: user.id, expiresAt } });
      return { username: user.username, mode: 'A' as const, totpActive: true, expiresAt };
    });
    return { ...result, sessionToken };
  }

  async me(raw?: string) {
    if (!raw) throw invalid();
    const session = await this.currentSession(raw);
    return { username: session.user.username, mode: 'A' as const, totpActive: session.user.totpActive, expiresAt: session.expiresAt };
  }

  async logout(session?: string, pending?: string) {
    await this.db.$transaction([
      this.db.session.deleteMany({ where: { tokenHash: digest(session ?? '') } }),
      this.db.pending.deleteMany({ where: { tokenHash: digest(pending ?? '') } }),
    ]);
  }

  async cleanup() {
    const now = new Date();
    await this.db.$transaction([
      this.db.pending.deleteMany({ where: { expiresAt: { lte: now } } }),
      this.db.session.deleteMany({ where: { expiresAt: { lte: now } } }),
      this.db.rateLimit.deleteMany({ where: { expiresAt: { lte: now } } }),
    ]);
  }
}
