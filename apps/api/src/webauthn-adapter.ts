import { Injectable } from '@nestjs/common';
import { generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse,
  type RegistrationResponseJSON, type AuthenticationResponseJSON } from '@simplewebauthn/server';
import { decodeAttestationObject, isoCBOR } from '@simplewebauthn/server/helpers';
import { invalid } from './session-policy.service.js';
import { registrationFailureCode, reportRegistrationFailure, type RegistrationFailureCode } from './webauthn-diagnostics.js';
import { WebAuthnIntermediates } from './webauthn-intermediates.js';

/** A replaceable boundary for protocol tests, with no runtime simulation or bypass flags. */
@Injectable()
export class WebAuthnAdapter {
  private intermediates?: WebAuthnIntermediates;
  configureRegistrationIntermediates(pems: unknown, roots: string[]) { this.intermediates = new WebAuthnIntermediates(pems, roots); }
  registrationOptions = generateRegistrationOptions;
  authenticationOptions = generateAuthenticationOptions;
  async registration(options: Parameters<typeof verifyRegistrationResponse>[0]) {
    let failure: RegistrationFailureCode = 'attestation_decode';
    let x5cCount: number | undefined;
    try {
      const decoded = decodeAttestationObject(Buffer.from(options.response.response.attestationObject, 'base64url'));
      if (!(decoded instanceof Map)) throw invalid();
      failure = 'attestation_format';
      if (decoded.get('fmt') !== 'packed') throw invalid();
      failure = 'attestation_chain';
      const chain = decoded.get('attStmt').get('x5c');
      x5cCount = !chain ? 0 : Array.isArray(chain) && chain.length <= 5 ? chain.length : undefined;
      // A packed self-attestation cannot establish the authenticator manufacturer.
      if (!chain?.length || chain.length > 5 || chain.some((c: Uint8Array) => c.byteLength > 8192)) throw invalid();
      let verificationOptions = options;
      if (this.intermediates) {
        const completed = this.intermediates.complete(chain);
        if (completed.length !== chain.length) {
          // Packed signs authData || clientDataHash, not the x5c envelope. Preserve every signed byte.
          const attStmt = new Map(decoded.get('attStmt'));
          attStmt.set('x5c', completed);
          const envelope = new Map(decoded);
          envelope.set('attStmt', attStmt);
          verificationOptions = { ...options, response: { ...options.response, response: { ...options.response.response,
            attestationObject: Buffer.from(isoCBOR.encode(envelope)).toString('base64url') } } };
        }
      }
      let result: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
      try { result = await verifyRegistrationResponse(verificationOptions); }
      catch (error) { failure = registrationFailureCode(error); throw invalid(); }
      failure = 'signature_invalid';
      if (!result.verified) throw invalid();
      failure = 'device_policy';
      if (!result.registrationInfo.userVerified || result.registrationInfo.credentialBackedUp ||
        result.registrationInfo.credentialDeviceType !== 'singleDevice') throw invalid();
      return result.registrationInfo;
    } catch { reportRegistrationFailure(failure, x5cCount); throw invalid(); }
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
