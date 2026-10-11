# ADR 0001: základ projektu

Stav: prijaté pre prototyp.

Jeden lokálny monorepozitár obsahuje web, API, Android a dokumentáciu. Používame React/Vite, NestJS, PostgreSQL/Prisma a Kotlin/Compose. Biometria sa overuje systémovo na telefóne a povoľuje podpis serverovej výzvy. Neimplementujeme vlastný biometrický model ani NFC tok.

Tri režimy A/B/C sú samostatné serverom kontrolované politiky. Režim C identifikuje účet discoverable YubiKey credential a vyžaduje ďalší mobilný dôkaz. Vlastný QR tok zjednodušuje kontrolu používateľského rozhrania, ale neposkytuje automatický dôkaz fyzickej blízkosti.

Prvá etapa je dokumentačný scaffold a inštalované projektové skilly. Nie je to funkčná aplikácia ani produkčne overený autentifikačný systém. Hosting, verejný onboarding, presná obnova účtu a attestation politika musia byť rozhodnuté pred produkčným použitím.
