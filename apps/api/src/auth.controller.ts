import { Body, Controller, Get, Post, Req, Res, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';

export const sessionCookie = '__Host-bio_session';
export const pendingCookie = '__Host-bio_pending';
const cookies = { secure: true, httpOnly: true, sameSite: 'strict' as const, path: '/' };
function field(body: unknown, name: string, pattern: RegExp, max: number) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Neplatný formulár.');
  const value = (body as Record<string, unknown>)[name];
  if (typeof value !== 'string' || value.length > max || !pattern.test(value)) throw new BadRequestException('Skontrolujte vyplnené údaje.');
  return value;
}

@Controller('api')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Get('health') health() { return { status: 'ok', modes: ['A'] }; }
  @Post('auth/register') async register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const username = field(body, 'username', /^[a-z0-9][a-z0-9._-]{2,63}$/, 64);
    const password = field(body, 'password', /^[\s\S]{8,128}$/, 128);
    const result = await this.auth.register(username, password, req.ip ?? 'unknown', req.cookies[sessionCookie]);
    res.clearCookie(pendingCookie, cookies);
    res.cookie(sessionCookie, result.sessionToken, { ...cookies, expires: result.user.expiresAt });
    return result.user;
  }
  @Post('auth/password') async password(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const username = field(body, 'username', /^[a-z0-9][a-z0-9._-]{2,63}$/, 64);
    const password = field(body, 'password', /^[\s\S]{1,128}$/, 128);
    const result = await this.auth.password(username, password, req.ip ?? 'unknown', req.cookies[pendingCookie], req.cookies[sessionCookie]);
    if (result.step === 'totp') {
      res.cookie(pendingCookie, result.pendingToken, { ...cookies, expires: result.expiresAt });
      return { step: result.step, expiresAt: result.expiresAt };
    }
    res.clearCookie(pendingCookie, cookies);
    res.cookie(sessionCookie, result.sessionToken, { ...cookies, expires: result.user.expiresAt });
    return { step: result.step, expiresAt: result.user.expiresAt, user: result.user };
  }
  @Get('auth/enrollment') enrollment(@Req() req: Request) { return this.auth.enrollment(req.cookies[sessionCookie]); }
  @Post('auth/totp/activate') async activate(@Body() body: unknown, @Req() req: Request) {
    return this.auth.activateTotp(req.cookies[sessionCookie], field(body, 'code', /^\d{6}$/, 6));
  }
  @Post('auth/totp') async totp(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const code = field(body, 'code', /^\d{6}$/, 6);
    const { sessionToken, ...result } = await this.auth.totp(req.cookies[pendingCookie], code);
    const oldSession = req.cookies[sessionCookie];
    if (oldSession) await this.auth.logout(oldSession);
    res.clearCookie(pendingCookie, cookies);
    res.cookie(sessionCookie, sessionToken, { ...cookies, expires: result.expiresAt });
    return result;
  }
  @Get('auth/me') me(@Req() req: Request) { return this.auth.me(req.cookies[sessionCookie]); }
  @Post('auth/logout') async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies[sessionCookie], req.cookies[pendingCookie]);
    res.clearCookie(sessionCookie, cookies); res.clearCookie(pendingCookie, cookies);
    return { ok: true };
  }
}
