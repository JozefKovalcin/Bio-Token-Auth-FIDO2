import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { MobilePublicJwk } from './mobile.crypto.js';
import { digest } from './crypto.js';

export type MobileAttestationInput = {
  challenge: string; approvalPublicJwk: MobilePublicJwk; authPublicJwk: MobilePublicJwk;
  approvalAttestation: string[]; authAttestation: string[];
};
export type MobileTrust = { trustLevel: 'HARDWARE_ATTESTED'; evidence: Record<string, string | number | boolean> };

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
      if (!response.ok) throw new Error();
      const raw = await response.text();
      if (raw.length > 8192) throw new Error();
      const result = JSON.parse(raw) as { verified?: boolean; trustLevel?: string; evidence?: Record<string, string | number | boolean> };
      if (result.verified !== true || result.trustLevel !== 'HARDWARE_ATTESTED' || !result.evidence) throw new Error();
      return { trustLevel: 'HARDWARE_ATTESTED', evidence: result.evidence };
    } catch { throw new UnauthorizedException('Dôveryhodnú hardvérovú atestáciu sa nepodarilo overiť.'); }
  }

  /** Enrollment establishes key policy; this check continuously enforces the live certificate CRL. */
  async checkTrust(evidence: unknown, forceFresh = false): Promise<void> {
    this.assertEnabled();
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new UnauthorizedException('Chýba dôveryhodný dôkaz zariadenia.');
    const record = evidence as Record<string, unknown>;
    if (typeof record.certificateSerials !== 'string' || record.certificateSerials.length > 8192 || typeof record.verifier !== 'string') throw new UnauthorizedException('Chýba dôveryhodný dôkaz zariadenia.');
    const cacheKey = digest(`${record.verifier}:${record.certificateSerials}`);
    if (!forceFresh && (this.trustCache.get(cacheKey) ?? 0) > Date.now()) return;
    try {
      const endpoint = new URL(process.env.ATTESTATION_SERVICE_URL!);
      if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['attestation', '127.0.0.1', 'localhost'].includes(endpoint.hostname))) throw new Error();
      const response = await fetch(new URL('/trust-status', endpoint), {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.ATTESTATION_SERVICE_TOKEN}` },
        body: JSON.stringify({ evidence: { verifier: record.verifier, certificateSerials: record.certificateSerials } }),
        signal: AbortSignal.timeout(12_000), redirect: 'error',
      });
      if (!response.ok) throw new Error();
      const raw = await response.text();
      if (raw.length > 1024 || JSON.parse(raw).trusted !== true) throw new Error();
      if (this.trustCache.size >= 1000) this.trustCache.clear();
      this.trustCache.set(cacheKey, Date.now() + 60_000);
    } catch {
      this.trustCache.delete(cacheKey);
      throw new UnauthorizedException('Dôveru zariadenia sa nepodarilo obnoviť.');
    }
  }
}
