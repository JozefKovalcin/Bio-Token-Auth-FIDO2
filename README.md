# Bio Token Auth

Návrh a základ pracovného repozitára pre viacfaktorový autentifikačný systém kombinujúci YubiKey 5C NFC a biometrické overenie na Android telefóne.

## Prihlasovacie režimy

| Režim | Postup |
| --- | --- |
| A | Používateľské meno + heslo → TOTP |
| B | Používateľské meno + heslo → YubiKey cez WebAuthn |
| C | YubiKey cez USB → QR → biometricky autorizovaný podpis na telefóne → prihlásenie na PC |

Režim C používa discoverable credential na rozpoznanie účtu bez mena a hesla. Pre kľúč sa vyžaduje user verification (FIDO2 PIN) a potvrdenie prítomnosti. Režim B registruje non-discoverable credential. Dostupné režimy určuje politika účtu; slabší režim nesmie obísť povinný režim C.

## Stack

- Web: React, TypeScript, Vite, SimpleWebAuthn.
- API: NestJS, TypeScript, SimpleWebAuthn.
- Databáza: PostgreSQL, Prisma.
- Android: Kotlin, Jetpack Compose, Coroutines/Flow, AndroidX Biometric, Android Keystore.
- Prevádzka: Docker Compose, HTTPS cez Caddy; pri prototypovaní polling.

## Stav

Repozitár obsahuje dokumentáciu, adresárovú štruktúru a projektové skilly. Aplikácie, závislosti a prihlasovanie zatiaľ nie sú implementované. README priečinkov opisujú plánovanú implementáciu; neobsahujú spustiteľné aplikácie.

## Dokumentácia

- [Architektúra](docs/architecture.md)
- [Prihlasovanie](docs/authentication-flow.md)
- [Registrácia a obnova](docs/enrollment-recovery.md)
- [Model hrozieb](docs/threat-model.md)
- [Overenie a etapy](docs/testing.md)
- [Skilly](docs/skills.md)

## Práca s Gitom

Stabilná vetva je `main`. Zmeny robte v krátkych vetvách `feat/...`, `fix/...` alebo `docs/...`. Commity majú opisovať jednu ucelenú zmenu. Pred commitom skontrolujte diff a tajomstvá. Repozitár nie je automaticky publikovaný na GitHub.
