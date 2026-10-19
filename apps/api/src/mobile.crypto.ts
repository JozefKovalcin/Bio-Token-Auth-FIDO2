import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { calculateJwkThumbprint, compactVerify, importJWK, type JWK } from 'jose';
import { randomUUID } from 'node:crypto';
import { token } from './crypto.js';

export type MobilePublicJwk = { kty: 'EC'; crv: 'P-256'; x: string; y: string };
const encodedHeader = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'bio-mobile+jws' })).toString('base64url');

export function mobilePublicJwk(value: unknown): MobilePublicJwk {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Neplatný verejný kľúč.');
  const key = value as Record<string, unknown>;
  if (Object.keys(key).some(name => !['kty', 'crv', 'x', 'y'].includes(name)) || key.kty !== 'EC' || key.crv !== 'P-256') throw new BadRequestException('Vyžaduje sa verejný EC P-256 kľúč.');
  for (const name of ['x', 'y']) {
    if (typeof key[name] !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key[name] as string) || Buffer.from(key[name] as string, 'base64url').length !== 32) throw new BadRequestException('Neplatný verejný kľúč.');
  }
  return { kty: 'EC', crv: 'P-256', x: key.x as string, y: key.y as string };
}

export function mobileSigningInput(purpose: string, expiresAt: Date, claims: Record<string, unknown>) {
  const payload = { version: 1, aud: process.env.APP_ORIGIN, purpose, nonce: token(), jti: randomUUID(), exp: Math.floor(expiresAt.getTime() / 1000), ...claims };
  return `${encodedHeader}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

export async function verifyMobileJws(jws: string, signingInput: string, value: unknown) {
  try {
    if (typeof jws !== 'string' || jws.length > 16_384 || jws.split('.').length !== 3) throw new Error();
    const [header, payload, signature] = jws.split('.');
    if (`${header}.${payload}` !== signingInput || !/^[A-Za-z0-9_-]{86}$/.test(signature)) throw new Error();
    const key = await importJWK(mobilePublicJwk(value) as JWK, 'ES256');
    const result = await compactVerify(jws, key, { algorithms: ['ES256'] });
    if (result.protectedHeader.typ !== 'bio-mobile+jws') throw new Error();
  } catch { throw new UnauthorizedException('Mobilné overenie zlyhalo. Začnite znova.'); }
}

export async function mobileKeyFingerprint(value: unknown) {
  return calculateJwkThumbprint(mobilePublicJwk(value), 'sha256');
}
