import { Injectable } from '@nestjs/common';
import { generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse,
  type RegistrationResponseJSON, type AuthenticationResponseJSON } from '@simplewebauthn/server';
import { decodeAttestationObject } from '@simplewebauthn/server/helpers';
import { invalid } from './session-policy.service.js';

/** A replaceable boundary for protocol tests, with no runtime simulation or bypass flags. */
@Injectable()
export class WebAuthnAdapter {
  registrationOptions = generateRegistrationOptions;
  authenticationOptions = generateAuthenticationOptions;
  async registration(options: Parameters<typeof verifyRegistrationResponse>[0]) {
    try {
      const decoded = decodeAttestationObject(Buffer.from(options.response.response.attestationObject, 'base64url'));
      const chain = decoded.get('attStmt').get('x5c');
      // A packed self-attestation cannot establish the authenticator manufacturer.
      if (decoded.get('fmt') !== 'packed' || !chain?.length || chain.length > 5 || chain.some(c => c.byteLength > 8192)) throw invalid();
      const result = await verifyRegistrationResponse(options);
      if (!result.verified || !result.registrationInfo.userVerified || result.registrationInfo.credentialBackedUp ||
        result.registrationInfo.credentialDeviceType !== 'singleDevice') throw invalid();
      return result.registrationInfo;
    } catch { throw invalid(); }
  }
  async authentication(options: Parameters<typeof verifyAuthenticationResponse>[0]) {
    try {
      const result = await verifyAuthenticationResponse(options);
      if (!result.verified || !result.authenticationInfo.userVerified || result.authenticationInfo.credentialBackedUp ||
        result.authenticationInfo.credentialDeviceType !== 'singleDevice') throw invalid();
      return result.authenticationInfo;
    } catch { throw invalid(); }
  }
}
export type { RegistrationResponseJSON, AuthenticationResponseJSON };
