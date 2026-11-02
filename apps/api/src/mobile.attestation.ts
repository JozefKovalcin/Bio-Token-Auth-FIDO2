import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { MobilePublicJwk } from './mobile.crypto.js';
import { digest } from './crypto.js';

export type MobileAttestationInput = {
  challenge: string; approvalPublicJwk: MobilePublicJwk; authPublicJwk: MobilePublicJwk;
  approvalAttestation: string[]; authAttestation: string[];
};
export type MobileTrust = { trustLevel: 'HARDWARE_ATTESTED'; evidence: Record<string, string | number | boolean> };

const verifierVersion = 'android/keyattestation@621149c4ebaeeea844d6f43098687c73c4d370a3';
const hardwareLevels = new Set(['TRUSTED_ENVIRONMENT', 'STRONG_BOX']);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
  return value as Record<string, unknown>;
}

/** Read decoded response bytes with a hard limit, even without an honest Content-Length. */
async function boundedJson(response: Response, maximum: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error();
  try {
    if (!response.ok) throw new Error();
    const length = response.headers.get('content-length');
    if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > maximum)) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error();
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally {
    // Stop an oversized, failed or unread response instead of consuming the remaining body.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function trustIdentity(value: unknown) {
  const evidence = record(value);
  if (evidence.verifier !== verifierVersion || typeof evidence.certificateSerials !== 'string' || evidence.certificateSerials.length > 8192) throw new Error();
  const serials = evidence.certificateSerials.split(',');
  if (serials.length < 2 || serials.length > 16 || serials.some(serial => !/^[0-9a-f]{1,256}$/.test(serial))) throw new Error();
  return { verifier: verifierVersion, certificateSerials: evidence.certificateSerials };
}

/** This is the actual JVM /verify response contract, not client-provided hardware claims. */
function verifiedEvidence(value: unknown): MobileTrust['evidence'] {
  const evidence = record(value);
  const identity = trustIdentity(evidence);
  if (typeof evidence.approvalSecurityLevel !== 'string' || !hardwareLevels.has(evidence.approvalSecurityLevel) ||
    typeof evidence.authSecurityLevel !== 'string' || !hardwareLevels.has(evidence.authSecurityLevel) ||
    evidence.verifiedBoot !== true || evidence.applicationVerified !== true || evidence.biometricPerUse !== true ||
    typeof evidence.verifiedAt !== 'string' || evidence.verifiedAt.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(evidence.verifiedAt) || !Number.isFinite(Date.parse(evidence.verifiedAt))) throw new Error();
  return { ...identity, approvalSecurityLevel: evidence.approvalSecurityLevel, authSecurityLevel: evidence.authSecurityLevel,
    verifiedBoot: true, applicationVerified: true, biometricPerUse: true, verifiedAt: evidence.verifiedAt };
}

/** The internal JVM service uses the official android/keyattestation verifier. No client trust flags. */
@Injectable()
export class MobileAttestationVerifier {
  private readonly trustCache = new Map<string, number>();
  enabled() {
    return process.env.MODE_C_ENABLED === 'true' && process.env.MODE_C_HARDWARE_VERIFIED === 'true'
      && !!process.env.ATTESTATION_SERVICE_URL && !!process.env.ATTESTATION_SERVICE_TOKEN;
  }
  assertEnabled() {
    if (!this.enabled()) throw new ServiceUnavailableException('Režim C nie je povolený: vyžaduje dôveryhodnú atestáciu a overenie fyzických zariadení.');
  }
  async verify(input: MobileAttestationInput): Promise<MobileTrust> {
    this.assertEnabled();
    for (const chain of [input.approvalAttestation, input.authAttestation]) {
      if (!Array.isArray(chain) || chain.length < 2 || chain.length > 8 || chain.some(cert => typeof cert !== 'string' || cert.length > 16_384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(cert))) throw new UnauthorizedException('Neplatná atestácia.');
    }
    try {
      const endpoint = new URL(process.env.ATTESTATION_SERVICE_URL!);
      // HTTP is restricted to the explicitly named, unpublished Compose service or loopback.
      if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['attestation', '127.0.0.1', 'localhost'].includes(endpoint.hostname))) throw new Error();
      const response = await fetch(new URL('/verify', endpoint), {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.ATTESTATION_SERVICE_TOKEN}` },
        body: JSON.stringify(input), signal: AbortSignal.timeout(15_000), redirect: 'error',
      });
      const result = record(await boundedJson(response, 8192));
      if (result.verified !== true || result.trustLevel !== 'HARDWARE_ATTESTED') throw new Error();
      return { trustLevel: 'HARDWARE_ATTESTED', evidence: verifiedEvidence(result.evidence) };
    } catch { throw new UnauthorizedException('Dôveryhodnú hardvérovú atestáciu sa nepodarilo overiť.'); }
  }

  /** Enrollment establishes key policy; this check continuously enforces the live certificate CRL. */
  async checkTrust(evidence: unknown, forceFresh = false): Promise<void> {
    this.assertEnabled();
    let identity: ReturnType<typeof trustIdentity>;
    try { identity = trustIdentity(evidence); }
    catch { throw new UnauthorizedException('Chýba dôveryhodný dôkaz zariadenia.'); }
    const cacheKey = digest(`${identity.verifier}:${identity.certificateSerials}`);
    if (!forceFresh && (this.trustCache.get(cacheKey) ?? 0) > Date.now()) return;
    try {
      const endpoint = new URL(process.env.ATTESTATION_SERVICE_URL!);
      if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['attestation', '127.0.0.1', 'localhost'].includes(endpoint.hostname))) throw new Error();
      const response = await fetch(new URL('/trust-status', endpoint), {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.ATTESTATION_SERVICE_TOKEN}` },
        body: JSON.stringify({ evidence: identity }),
        signal: AbortSignal.timeout(12_000), redirect: 'error',
      });
      if (record(await boundedJson(response, 1024)).trusted !== true) throw new Error();
      if (this.trustCache.size >= 1000) this.trustCache.clear();
      this.trustCache.set(cacheKey, Date.now() + 60_000);
    } catch {
      this.trustCache.delete(cacheKey);
      throw new UnauthorizedException('Dôveru zariadenia sa nepodarilo obnoviť.');
    }
  }
}
