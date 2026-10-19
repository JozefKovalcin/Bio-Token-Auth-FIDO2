import { X509Certificate } from 'node:crypto';

/** Issuer lookup only. SimpleWebAuthn still validates the completed path to configured roots. */
export class WebAuthnIntermediates {
  private readonly intermediates: X509Certificate[];
  private readonly roots: X509Certificate[];

  constructor(pems: unknown, roots: string[]) {
    if (!Array.isArray(pems) || !pems.length || pems.length > 10 || pems.some(pem => typeof pem !== 'string' || pem.length > 16384) || !roots.length) {
      throw new Error('WEBAUTHN_INTERMEDIATES_FILE must contain a bounded JSON array of public PEM intermediates');
    }
    this.roots = roots.map(pem => new X509Certificate(pem));
    this.intermediates = pems.map(pem => new X509Certificate(pem));
    const fingerprints = new Set(this.roots.map(cert => cert.fingerprint256));
    for (const cert of this.intermediates) {
      if (!cert.ca || cert.raw.byteLength > 8192 || Date.parse(cert.validFrom) > Date.now() || Date.parse(cert.validTo) <= Date.now() ||
        (cert.checkIssued(cert) && cert.verify(cert.publicKey)) || fingerprints.has(cert.fingerprint256)) {
        throw new Error('Invalid, duplicate or root certificate in WebAuthn intermediate pool');
      }
      fingerprints.add(cert.fingerprint256);
    }
  }

  complete(chain: Uint8Array[]): Uint8Array[] {
    if (!Array.isArray(chain) || !chain.length || chain.length > 5 || chain.some(cert => !(cert instanceof Uint8Array) || cert.byteLength > 8192)) {
      throw new Error('Invalid packed certificate chain');
    }
    const result = [...chain];
    const parsed = chain.map(cert => new X509Certificate(cert));
    const seen = new Set(parsed.map(cert => cert.fingerprint256));
    if (seen.size !== parsed.length) throw new Error('Duplicate packed certificate chain');
    let current = parsed[parsed.length - 1];
    while (!this.roots.some(root => current.fingerprint256 === root.fingerprint256 || this.issuedBy(current, root))) {
      const issuers = this.intermediates.filter(issuer => this.issuedBy(current, issuer));
      if (!issuers.length) break; // The standard verifier will reject a path that cannot reach a root.
      if (issuers.length !== 1 || seen.has(issuers[0].fingerprint256) || result.length >= 5) throw new Error('Ambiguous, cyclic or oversized packed certificate chain');
      current = issuers[0];
      seen.add(current.fingerprint256);
      result.push(new Uint8Array(current.raw));
    }
    return result;
  }

  private issuedBy(child: X509Certificate, issuer: X509Certificate) {
    return child.checkIssued(issuer) && child.verify(issuer.publicKey);
  }
}
