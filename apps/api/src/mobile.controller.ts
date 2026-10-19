import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MobileService } from './mobile.service.js';
import { mobilePublicJwk } from './mobile.crypto.js';
import { pendingCookie, sessionCookie } from './auth.controller.js';

const cookieOptions = { secure: true, httpOnly: true, sameSite: 'strict' as const, path: '/' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const opaque = /^[A-Za-z0-9_-]{43}$/;
function object(body: unknown, names: string[]) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !names.includes(key))) throw new BadRequestException('Neplatná požiadavka.');
  return body as Record<string, unknown>;
}
function text(body: Record<string, unknown>, key: string, pattern = /^[\s\S]+$/, max = 16_384) {
  const value = body[key];
  if (typeof value !== 'string' || value.length > max || !pattern.test(value)) throw new BadRequestException('Neplatná požiadavka.');
  return value;
}
function id(value: string) { if (!uuid.test(value)) throw new BadRequestException('Neplatný identifikátor.'); return value; }
function certificates(body: Record<string, unknown>, key: string) {
  const list = body[key];
  if (!Array.isArray(list) || list.length < 2 || list.length > 8 || list.some(value => typeof value !== 'string' || value.length > 16_384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))) throw new BadRequestException('Neplatný certifikačný reťazec.');
  return list as string[];
}

/** Native endpoints authenticate by signed, one-use proofs; browser cookies confer no authority. */
@Controller('api/mobile')
export class MobileController {
  constructor(private readonly mobile: MobileService) {}
  @Post('pairings/resolve') resolvePairing(@Body() value: unknown, @Req() req: Request) {
    const body = object(value, ['pairingToken']);
    return this.mobile.resolvePairing(text(body, 'pairingToken', opaque, 43), req.ip ?? 'unknown');
  }
  @Post('pairings/candidate') candidate(@Body() value: unknown, @Req() req: Request) {
    const body = object(value, ['pairingToken', 'label', 'approvalPublicJwk', 'authPublicJwk', 'approvalAttestation', 'authAttestation']);
    return this.mobile.candidate(text(body, 'pairingToken', opaque, 43), {
      label: text(body, 'label', /^[^\x00-\x1f\x7f]+$/, 80), approvalPublicJwk: mobilePublicJwk(body.approvalPublicJwk), authPublicJwk: mobilePublicJwk(body.authPublicJwk),
      approvalAttestation: certificates(body, 'approvalAttestation'), authAttestation: certificates(body, 'authAttestation'),
    }, req.ip ?? 'unknown');
  }
  @Post('pairings/prove') prove(@Body() value: unknown) {
    const body = object(value, ['pairingToken', 'challengeId', 'approvalJws', 'authJws']);
    return this.mobile.provePairing(text(body, 'pairingToken', opaque, 43), text(body, 'challengeId', uuid, 36), text(body, 'approvalJws'), text(body, 'authJws'));
  }
  @Post('auth/challenge') challenge(@Body() value: unknown, @Req() req: Request) {
    const body = object(value, ['deviceId', 'transactionToken', 'operation']);
    const operation = text(body, 'operation', /^(resolve|reject)$/, 7) as 'resolve' | 'reject';
    return this.mobile.authChallenge(text(body, 'deviceId', uuid, 36), text(body, 'transactionToken', opaque, 43), operation, req.ip ?? 'unknown');
  }
  @Post('auth/resolve') resolve(@Body() value: unknown) {
    const body = object(value, ['challengeId', 'proofJws']);
    return this.mobile.resolve(text(body, 'challengeId', uuid, 36), text(body, 'proofJws'));
  }
  @Post('auth/approve') approve(@Body() value: unknown) {
    const body = object(value, ['challengeId', 'approvalJws']);
    return this.mobile.decide(text(body, 'challengeId', uuid, 36), text(body, 'approvalJws'), true);
  }
  @Post('auth/reject') reject(@Body() value: unknown) {
    const body = object(value, ['challengeId', 'proofJws']);
    return this.mobile.decide(text(body, 'challengeId', uuid, 36), text(body, 'proofJws'), false);
  }
  @Post('devices/challenge') deviceChallenge(@Body() value: unknown, @Req() req: Request) {
    const body = object(value, ['deviceId']);
    return this.mobile.deviceChallenge(text(body, 'deviceId', uuid, 36), req.ip ?? 'unknown');
  }
  @Post('devices/status') deviceStatus(@Body() value: unknown) {
    const body = object(value, ['challengeId', 'proofJws']);
    return this.mobile.deviceStatus(text(body, 'challengeId', uuid, 36), text(body, 'proofJws'));
  }
}

@Controller('api')
export class MobileBrowserController {
  constructor(private readonly mobile: MobileService) {}
  @Post('account/pairings') start(@Body() value: unknown, @Req() req: Request) {
    const body = object(value, ['proofId', 'grant']);
    return this.mobile.startPairing(req.cookies[sessionCookie], text(body, 'proofId', uuid, 36), text(body, 'grant', opaque, 43));
  }
  @Get('account/pairings/:id') pairingStatus(@Param('id') value: string, @Req() req: Request) {
    return this.mobile.pairingStatus(req.cookies[sessionCookie], id(value));
  }
  @Post('account/pairings/:id/confirm') confirm(@Param('id') value: string, @Body() input: unknown, @Req() req: Request) {
    const body = object(input, ['deviceId', 'confirmationCode']);
    return this.mobile.confirmPairing(req.cookies[sessionCookie], id(value), text(body, 'deviceId', uuid, 36), text(body, 'confirmationCode', /^[A-Za-z0-9_-]{8}-[A-Za-z0-9_-]{8}$/, 17));
  }
  @Get('account/devices') devices(@Req() req: Request) { return this.mobile.devices(req.cookies[sessionCookie]); }
  @Post('account/devices/:id/revoke') revoke(@Param('id') value: string, @Body() input: unknown, @Req() req: Request) {
    const body = object(input, ['grant']);
    return this.mobile.revoke(req.cookies[sessionCookie], id(value), text(body, 'grant', opaque, 43));
  }
  @Get('auth/c/status') status(@Query('transactionId') value: unknown, @Req() req: Request) {
    if (typeof value !== 'string') throw new BadRequestException('Chýba transakcia.');
    return this.mobile.status(req.cookies[pendingCookie], id(value));
  }
  @Post('auth/c/complete') async complete(@Body() input: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const body = object(input, ['transactionId']);
    const result = await this.mobile.complete(req.cookies[pendingCookie], req.cookies[sessionCookie], text(body, 'transactionId', uuid, 36));
    res.clearCookie(pendingCookie, cookieOptions);
    if ('sessionToken' in result) {
      const { sessionToken, ...publicResult } = result;
      res.cookie(sessionCookie, sessionToken, { ...cookieOptions, expires: result.expiresAt });
      return publicResult;
    }
    return result;
  }
  @Post('auth/c/cancel') async cancel(@Body() input: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const body = object(input, ['transactionId']);
    const result = await this.mobile.cancel(req.cookies[pendingCookie], text(body, 'transactionId', uuid, 36));
    res.clearCookie(pendingCookie, cookieOptions);
    return result;
  }
}
