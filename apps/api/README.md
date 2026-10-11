# API

Plán: NestJS + SimpleWebAuthn server + Prisma/PostgreSQL.

Moduly: users, passwords, totp, webauthn, devices, login-transactions, mobile-approval, sessions, audit.

Databázové entity: User, AccountPolicy, PasswordCredential, TotpCredential, WebAuthnCredential, MobileDevice, LoginTransaction, Session, AuditEvent.

OpenAPI bude kontraktom pre web a Android. Prisma migrácie budú uložené tu. Zatiaľ nie je implementovaná schéma ani API.
