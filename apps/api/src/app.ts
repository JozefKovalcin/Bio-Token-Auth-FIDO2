import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { Database } from './database.js';
import { encryptionKey } from './crypto.js';

@Module({ controllers: [AuthController], providers: [Database, AuthService] })
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
  app.use((req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.headers.origin !== origin || !req.is('application/json'))) {
      return res.status(403).json({ message: 'Požiadavka musí pochádzať z tejto aplikácie.' });
    }
    next();
  });
  app.use(json({ limit: '8kb' }));
  app.use(cookieParser());
  app.enableShutdownHooks();
  await app.get(Database).$connect();
  return app;
}
