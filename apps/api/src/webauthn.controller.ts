import { Body, Controller, Get, Post, Param, Req, Res, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { WebAuthnService } from './webauthn.service.js';
import { field, pendingCookie, sessionCookie } from './auth.controller.js';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from './webauthn-adapter.js';

const cookies = { secure: true, httpOnly: true, sameSite: 'strict' as const, path: '/' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function credentialResponse(body: unknown, registration: true): RegistrationResponseJSON;
function credentialResponse(body: unknown, registration?: false): AuthenticationResponseJSON;
function credentialResponse(body: unknown, registration = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Neplatné overenie.');
  const candidate = (body as Record<string, unknown>).response;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new BadRequestException('Chýba WebAuthn odpoveď.');
  const value = candidate as Record<string, unknown>;
  if (value.type !== 'public-key' || typeof value.id !== 'string' || value.id.length > 2048 || !/^[\w-]+$/.test(value.id) ||
    value.rawId !== value.id || !value.response || typeof value.response !== 'object' || Array.isArray(value.response)) throw new BadRequestException('Neplatný credential.');
  const response = value.response as Record<string, unknown>;
  for (const name of registration ? ['clientDataJSON', 'attestationObject'] : ['clientDataJSON', 'authenticatorData', 'signature']) {
    if (typeof response[name] !== 'string' || response[name].length > (registration ? 49152 : 4096) || !/^[\w-]+$/.test(response[name])) throw new BadRequestException('Neplatné údaje podpisu.');
  }
  if (response.userHandle !== undefined && response.userHandle !== null &&
    (typeof response.userHandle !== 'string' || response.userHandle.length > 128 || !/^[\w-]+$/.test(response.userHandle))) throw new BadRequestException('Neplatný účet.');
  return candidate as RegistrationResponseJSON & AuthenticationResponseJSON;
}

@Controller('api')
export class WebAuthnController {
  constructor(private readonly webauthn: WebAuthnService) {}
  @Get('auth/capabilities') capabilities() { return this.webauthn.capabilities(); }
  @Get('account/webauthn') list(@Req() req: Request) { return this.webauthn.list(req.cookies[sessionCookie]); }
  @Post('account/webauthn/registrations/options') registrationOptions(@Body() body: unknown, @Req() req: Request) {
    return this.webauthn.registrationOptions(req.cookies[sessionCookie], field(body, 'profile', /^(B|C)$/, 1), field(body, 'grant', /^[\w-]{43}$/, 43));
  }
  @Post('account/webauthn/registrations/verify') registrationVerify(@Body() body: unknown, @Req() req: Request) {
    return this.webauthn.registrationVerify(req.cookies[sessionCookie], field(body, 'registrationId', uuid, 36), credentialResponse(body, true));
  }
  @Post('account/webauthn/activations/options') activationOptions(@Body() body: unknown, @Req() req: Request) {
    return this.webauthn.proofOptions(req.cookies[sessionCookie], 'ACTIVATE', field(body, 'credentialId', uuid, 36));
  }
  @Post('account/webauthn/activations/verify') activationVerify(@Body() body: unknown, @Req() req: Request) {
    return this.webauthn.proofVerify(req.cookies[sessionCookie], field(body, 'proofId', uuid, 36), credentialResponse(body), 'ACTIVATE');
  }
  @Post('account/webauthn/proofs/options') proofOptions(@Body() body: unknown, @Req() req: Request) {
    field(body, 'purpose', /^PAIRING$/, 7);
    return this.webauthn.proofOptions(req.cookies[sessionCookie], 'PAIRING');
  }
  @Post('account/webauthn/proofs/verify') proofVerify(@Body() body: unknown, @Req() req: Request) {
    return this.webauthn.proofVerify(req.cookies[sessionCookie], field(body, 'proofId', uuid, 36), credentialResponse(body), 'PAIRING');
  }
  @Post('account/webauthn/:id/revoke') revoke(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    if (!uuid.test(id)) throw new BadRequestException('Neplatný kľúč.');
    return this.webauthn.revoke(req.cookies[sessionCookie], id, field(body, 'grant', /^[\w-]{43}$/, 43));
  }
  @Post('account/policy') policy(@Body() body: unknown, @Req() req: Request) {
    const modes = (body as Record<string, unknown> | null)?.allowedModes;
    if (!Array.isArray(modes) || modes.some(m => typeof m !== 'string')) throw new BadRequestException('Neplatné režimy.');
    const proof = (body as Record<string, unknown>).activationProofId;
    return this.webauthn.setPolicy(req.cookies[sessionCookie], modes, field(body, 'grant', /^[\w-]{43}$/, 43),
      proof === undefined ? undefined : field(body, 'activationProofId', uuid, 36));
  }
  @Post('auth/b/password') async bPassword(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { pendingToken, ...result } = await this.webauthn.bPassword(field(body, 'username', /^[a-z0-9][a-z0-9._-]{2,63}$/, 64),
      field(body, 'password', /^[\s\S]{1,128}$/, 128), req.ip ?? 'unknown', req.cookies[pendingCookie], req.cookies[sessionCookie]);
    res.cookie(pendingCookie, pendingToken, { ...cookies, expires: result.expiresAt }); return result;
  }
  @Post('auth/b/options') bOptions(@Req() req: Request) { return this.webauthn.bOptions(req.cookies[pendingCookie]); }
  @Post('auth/b/verify') async bVerify(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.webauthn.bVerify(req.cookies[pendingCookie], credentialResponse(body));
    res.clearCookie(pendingCookie, cookies); res.cookie(sessionCookie, result.sessionToken, { ...cookies, expires: result.user.expiresAt }); return result.user;
  }
  @Post('auth/c/options') async cOptions(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const purpose = (body as Record<string, unknown> | null)?.purpose === undefined ? 'LOGIN' : field(body, 'purpose', /^(LOGIN|C_ACTIVATION)$/, 12);
    const { pendingToken, ...result } = await this.webauthn.cOptions(req.cookies[sessionCookie], purpose, req.ip ?? 'unknown', req.cookies[pendingCookie]);
    res.cookie(pendingCookie, pendingToken, { ...cookies, expires: result.expiresAt }); return result;
  }
  @Post('auth/c/verify') async cVerify(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.webauthn.cVerify(req.cookies[pendingCookie], req.cookies[sessionCookie], credentialResponse(body));
    res.cookie(pendingCookie, req.cookies[pendingCookie], { ...cookies, expires: result.expiresAt });
    return result;
  }
}
