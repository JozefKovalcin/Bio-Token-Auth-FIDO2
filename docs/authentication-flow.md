# Prihlasovací tok

A/B/C majú implementované softvérové toky. B/C sú dostupné iba po serverovej konfigurácii dôvery; fyzické akceptačné overenie zatiaľ nie je potvrdené. Konkrétne nastavenie a hranice uvádza modes-b-c.md.

## A: heslo a TOTP

Registrácia vytvorí účet a prihlásenú reláciu. Používateľ môže aktivovať časovo odvodené jednorazové heslo TOTP (Time-Based One-Time Password) pri registrácii alebo neskôr v účte. Kým faktor nie je aktívny, nové prihlásenie dokončí heslo. Po aktivácii server po správnom hesle vytvorí rozpracované overenie s päťminútovou platnosťou. Používateľ ho dokončí aktuálnym kódom TOTP. Server obmedzuje počet pokusov a odmieta opätovné použitie toho istého časového kroku.

## B: heslo a YubiKey

Tok overí používateľské meno a heslo, potom vyžiada podpis WebAuthn od zaregistrovaného kľúča YubiKey. Prihlasovacie údaje pre režim B nemajú byť objaviteľné. Ak nasadenie vyžaduje konkrétny model kľúča, samotný USB hint nestačí; server musí uplatniť príslušnú politiku atestácie.

## C: YubiKey a Android

1. Prehliadač vytvorí rozpracované prihlásenie a vyžiada WebAuthn bez používateľského mena.
2. Kľúč YubiKey použije objaviteľné prihlasovacie údaje. Server overí podpis, výzvu, RP ID, origin, identitu účtu a požadované príznaky prítomnosti a overenia používateľa.
3. Server vytvorí mobilnú výzvu s predvolenou platnosťou 120 sekúnd. QR kód obsahuje jednorazový náhodný identifikátor, nie session cookie.
4. Spárovaný telefón načíta transakciu, zobrazí službu a účet a vyžiada výslovné schválenie.
5. Biometricky autorizovaný kľúč v Android Keystore podpíše kanonickú serverovú výzvu. Podpis sa viaže na účel, transakciu, účet, expiráciu a jednorazovú hodnotu.
6. Backend overí podpis verejným kľúčom aktívneho zariadenia toho istého účtu a transakciu jednorazovo schváli.
7. Pôvodný prehliadač atomicky dokončí transakciu a dostane novú session cookie. Rozpracovaná relácia sa zruší.

Stavy transakcie sú `PENDING_YUBIKEY`, `PENDING_MOBILE`, `APPROVED` a `CONSUMED`. Koncové stavy sú `EXPIRED`, `REJECTED` a `CANCELLED`. Stavové endpointy môže použiť iba držiteľ príslušnej rozpracovanej relácie a QR obsah sa nesmie zapisovať do logov.
