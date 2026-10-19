import { Logger } from '@nestjs/common';

const codes = [
  'attestation_decode', 'attestation_format', 'attestation_chain', 'challenge_mismatch',
  'origin_mismatch', 'rp_mismatch', 'type_mismatch', 'up_required', 'uv_required',
  'certificate_path', 'certificate_profile', 'certificate_validity', 'signature_invalid',
  'verifier_rejected', 'device_policy', 'aaguid_not_allowed', 'session_not_fresh', 'finalization_rejected',
] as const;
export type RegistrationFailureCode = typeof codes[number];
const allowedCodes = new Set<string>(codes);
const logger = new Logger('WebAuthnDiagnostics');

/** Only finite classifications reach the logger. Never pass an exception or client data. */
export function reportRegistrationFailure(code: RegistrationFailureCode, x5cCount?: number) {
  const safeCode = allowedCodes.has(code) ? code : 'verifier_rejected';
  const includeCount = ['attestation_chain', 'certificate_path'].includes(safeCode) &&
    Number.isInteger(x5cCount) && x5cCount! >= 0 && x5cCount! <= 5;
  logger.warn(JSON.stringify({ event: 'webauthn.registration_rejected', code: safeCode, ...(includeCount ? { x5cCount } : {}) }));
}

/** Library errors can contain challenges and certificates; classify without forwarding them. */
export function registrationFailureCode(error: unknown): RegistrationFailureCode {
  try {
    let current: unknown = error;
    for (let depth = 0; depth < 4 && current instanceof Error; depth++) {
      if ('code' in current && current.code === 'CERTIFICATE_PATH_VERIFICATION_FAILED') return 'certificate_path';
      current = current.cause;
    }
    if (!(error instanceof Error)) return 'verifier_rejected';
    const message = error.message;
    if (message.startsWith('Unexpected registration response challenge ') || message.startsWith('Custom challenge verifier returned false ')) return 'challenge_mismatch';
    if (message.startsWith('Unexpected registration response origin ')) return 'origin_mismatch';
    if (message.startsWith('Unexpected RP ID hash')) return 'rp_mismatch';
    if (message.startsWith('Unexpected registration response type')) return 'type_mismatch';
    if (message === 'User presence was required, but user was not present') return 'up_required';
    if (message === 'User verification was required, but user could not be verified') return 'uv_required';
    if (message.startsWith('Certificate not good before ') || message.startsWith('Certificate not good after ')) return 'certificate_validity';
    if (message.startsWith('Certificate OU ') || message.startsWith('Certificate CN ') || message.startsWith('Certificate O ') ||
      message.startsWith('Certificate C ') || message.startsWith('Certificate basic constraints ') || message.startsWith('Certificate version ')) return 'certificate_profile';
  } catch { /* Unrecognized error objects also produce only a fixed classification. */ }
  return 'verifier_rejected';
}
