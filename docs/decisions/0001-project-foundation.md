# ADR 0001: Základ projektu

Stav: prijaté pre výskumný prototyp.

## Rozhodnutie

Web, API, Android klient a dokumentácia patria do jedného repozitára. Web a API používajú React/Vite, NestJS a PostgreSQL/Prisma. Android klient má používať Kotlin a Jetpack Compose. Biometria sa overuje systémovo v telefóne a povoľuje podpis serverovej výzvy; vlastný biometrický model ani NFC tok sa neimplementujú.

Režimy A/B/C určuje serverová politika účtu. Režim C používa objaviteľný prihlasovací údaj YubiKey na identifikáciu účtu a vyžaduje ďalší dôkaz z mobilného zariadenia. QR požiadavka prenáša identifikátor transakcie, no sama nepreukazuje fyzickú blízkosť telefónu.

## Dôsledky

Režim A je implementovaný. Režimy B/C a Android klient zostávajú plánované. Pred verejným nasadením treba určiť hosting, pravidlá registrácie, obnovu účtu a politiku atestácie zariadení. Aktuálny stav aplikácie opisuje [hlavný README](../../README.md).
