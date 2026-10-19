import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Database } from './database.js';
import { encryptionKey } from './crypto.js';
import { AuthCoreModule, MobileModule, WebAuthnModule } from './auth-modules.js';

@Module({ imports: [AuthCoreModule, WebAuthnModule, MobileModule] })
export class AppModule {}

export async function createApp() {
  encryptionKey();
  const origin = process.env.APP_ORIGIN ?? '';
  if (new URL(origin).origin !== origin || !origin.startsWith('https://')) throw new Error('APP_ORIGIN must be an HTTPS origin without a trailing slash');
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error', 'warn'] });
  const server = app.getHttpAdapter().getInstance();
  server.disable('x-powered-by');
  // Only Caddy can reach the unpublished API port; trust its single proxy hop.
  server.set('trust proxy', 1);
  app.use(helmet());
  const smallJson = json({ limit: '8kb' });
  const registrationJson = json({ limit: '64kb' });
  const attestationJson = json({ limit: '288kb' });
  app.use((req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-store');
    // Native routes have their own one-use cryptographic proofs, never cookie authority.
    const native = req.path.startsWith('/api/mobile/');
    if (native && req.headers.cookie) return res.status(403).json({ message: 'Mobilné rozhranie neprijíma webové cookies.' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      ((!native && req.headers.origin !== origin) || !req.is('application/json'))) {
      return res.status(403).json({ message: 'Požiadavka musí pochádzať z tejto aplikácie.' });
    }
    const names = String(req.headers.cookie ?? '').split(';').map((part: string) => part.trim().split('=')[0]);
    if (['__Host-bio_session', '__Host-bio_pending'].some(name => names.filter((value: string) => value === name).length > 1)) {
      return res.status(400).json({ message: 'Nejednoznačné cookies. Začnite znova.' });
    }
    next();
  });
  app.use((req: any, res: any, next: any) => {
    const parser = req.path === '/api/mobile/pairings/candidate' ? attestationJson :
      req.path === '/api/account/webauthn/registrations/verify' ? registrationJson : smallJson;
    parser(req, res, (error?: { type?: string }) => {
      // Body-parser errors can carry the raw body, including passwords and capabilities.
      // Return a bounded classification without passing that object to the Nest logger.
      if (error) {
        const status = error.type === 'entity.too.large' ? 413 : 400;
        return res.status(status).json({ statusCode: status, message: status === 413 ? 'Požiadavka je príliš veľká.' : 'Neplatný JSON formulár.' });
      }
      next();
    });
  });
  app.use(cookieParser());
  app.enableShutdownHooks();
  await app.get(Database).$connect();
  return app;
}
