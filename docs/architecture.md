# Architektúra

V aktuálnej etape webový klient komunikuje cez protokol HTTPS (Hypertext Transfer Protocol Secure) s aplikačným programovacím rozhraním (API, Application Programming Interface) implementovaným v NestJS. API ukladá účty, tajomstvá TOTP (Time-Based One-Time Password) a relácie do PostgreSQL pomocou Prisma ORM. Caddy poskytuje webové súbory a smeruje požiadavky `/api/*` na API. Všetky tri služby bežia v Docker Compose.

## Plánované režimy B a C

V režime B sa používateľ po zadaní hesla overí kľúčom YubiKey pomocou WebAuthn (Web Authentication). Režim C začína prihlásením kľúčom s objaviteľnými prihlasovacími údajmi (discoverable credential), ktorý server použije na rozpoznanie účtu. Následne web zobrazí QR kód pre krátkodobú požiadavku. Spárovaný telefón načíta údaje o transakcii a podpíše serverovú výzvu pomocou kľúča v Android Keystore.

PIN kľúča YubiKey nenahrádza biometrické potvrdenie v telefóne. Server v režime C musí overiť podpis, väzbu na účet, výzvu, pôvod požiadavky a požadované príznaky prítomnosti a overenia používateľa. Mobilná aplikácia nedostáva webovú reláciu. QR tok sám osebe nedokazuje, že telefón je fyzicky blízko počítača.

Biometrické údaje zostávajú v telefóne. Server overuje podpis vytvorený chráneným kľúčom, nie odtlačok prsta. Silnejšie tvrdenie o ochrane kľúča vyžaduje aj kontrolu jeho atestácie a pravidlá registrácie zariadení.

## Usporiadanie

Web, API, kontrakt OpenAPI a Android aplikácia patria do jedného repozitára. Web a API používajú TypeScript. Android aplikácia má používať samostatný Gradle build. PostgreSQL sa prevádzkuje lokálne v kontajneri; služba Supabase nie je potrebná.
