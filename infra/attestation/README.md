# Android attestation verifier

Internal JVM service using the official [android/keyattestation](https://github.com/android/keyattestation)
library, pinned to v0.4 / `621149c4ebaeeea844d6f43098687c73c4d370a3`.
The Docker build resolves that revision and its Gradle dependencies; this repository does not implement an ASN.1 parser.

`POST /verify` accepts the server challenge, both public JWKs and their base64 DER certificate chains.
It requires a bearer service token, bounded JSON and separate biometric approval / device authorization keys.
It verifies Google certificate roots and a fresh revocation list (including suspended certificates),
the challenge, configured application package / APK signer SHA-256 / minimum version,
public-key mapping, hardware security level, generated key origin, locked verified boot and the key authorization policies.
An unavailable CRL or an unknown/unsupported attestation fails closed.

The verifier returns the validated certificate serials as stored device trust evidence.
`POST /trust-status` checks that evidence against a fresh live CRL. The API checks it before mobile approval
(successful checks may be cached for at most 60 seconds), and forces a fresh check before browser finalization.
All network checks precede the database transaction; the transaction rechecks the device version and account state.
A certificate revocation therefore blocks an already enrolled device without requiring a new enrollment.

The approval key must be hardware EC P-256, SIGN-only, SHA256-only, authorized per operation by
strong biometrics without device-credential fallback. The separate device-auth key must have no user-auth requirement.
This key authorizes bounded read/reject requests; it never substitutes for approval.

Required environment variables:

- `ATTESTATION_SERVICE_TOKEN`: at least 32 characters; same secret on API and verifier.
- `ATTESTATION_PACKAGE_NAME`: exact installed application ID; debug and release IDs differ.
- `ATTESTATION_SIGNING_CERT_SHA256`: SHA-256 digest of the actual APK signing certificate, hexadecimal.
- `ATTESTATION_MIN_APP_VERSION`: positive minimum version code, default `1`.

Do not publish port 8081 or route it through Caddy. The Compose `mode-c` profile exposes it only on
the private Docker network. Restrict outbound access to the required Google revocation endpoint where practical.
`GET /health` reports service availability; it does not prove CRL access, successful enrollment or physical MFA.
Update the pinned verifier revision and its generated trust roots as part of maintenance.

Build and policy tests:

```powershell
docker build -t bio-attestation-check infra/attestation
```

The build runs JVM tests rejecting PIN fallback, timed authorization, software authorization, unauthenticated approval,
wrong algorithms and unverified boot. HTTP smoke tests cover missing service authorization and malformed attestations.
These checks do not replace physical Android enrollment and end-to-end YubiKey/biometric tests.

The API additionally requires `MODE_C_ENABLED=true`, `MODE_C_HARDWARE_VERIFIED=true`, and the trusted
service URL/token. Defaults keep C unavailable. First record the actual supported YubiKey, browser,
Android fingerprint device, APK identity and basic physical key/biometric negative-test results.
Only then enable C in an isolated acceptance environment to test real enrollment and the complete flow.
Production enablement requires that full acceptance to pass; see [the deployment protocol](../../docs/modes-b-c.md).
