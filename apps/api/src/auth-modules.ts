import { Module } from '@nestjs/common';
import { Database } from './database.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { SessionPolicyService } from './session-policy.service.js';
import { WebAuthnAdapter } from './webauthn-adapter.js';
import { WebAuthnController } from './webauthn.controller.js';
import { WebAuthnService } from './webauthn.service.js';
import { MobileAttestationVerifier } from './mobile.attestation.js';
import { MobileService } from './mobile.service.js';
import { MobileController, MobileBrowserController } from './mobile.controller.js';

@Module({ controllers: [AuthController], providers: [Database, SessionPolicyService, AuthService],
  exports: [Database, SessionPolicyService, AuthService] })
export class AuthCoreModule {}

@Module({ imports: [AuthCoreModule], controllers: [WebAuthnController], providers: [WebAuthnAdapter, WebAuthnService] })
export class WebAuthnModule {}

@Module({ imports: [AuthCoreModule], controllers: [MobileController, MobileBrowserController],
  providers: [MobileAttestationVerifier, MobileService] })
export class MobileModule {}
