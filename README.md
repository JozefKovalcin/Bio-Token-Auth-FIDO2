# Bio Token Auth

Bio Token Auth je výskumný prototyp viacfaktorového prihlasovania. Obsahuje režim A, implementáciu WebAuthn pre B a C, natívny Android klient a interný verifier Android hardvérovej atestácie. B/C sú predvolene vypnuté do konfigurácie dôvery a potrebného overenia; fyzický YubiKey/Android akceptačný protokol zatiaľ nebol vykonaný.

## Režimy prihlasovania

| Režim | Postup | Stav |
| --- | --- | --- |
| A | Používateľské meno a heslo; po aktivácii aj jednorazový kód TOTP | Implementovaný |
| B | Používateľské meno a heslo, potom YubiKey cez WebAuthn | API/web a automatické testy; vyžaduje trust konfiguráciu a fyzické overenie |
| C | YubiKey cez USB, QR požiadavka a biometricky autorizovaný podpis v telefóne | API/web/Android/verifier; predvolene vypnutý, fyzické MFA neoverené |

V režime A sa TOTP nastavuje v účte po registrácii. Po aktivácii ho server vyžaduje pri každom ďalšom prihlásení. B/C vyžadujú stabilný DNS hostname, dôveryhodné HTTPS a explicitnú serverovú politiku. C viaže oba faktory na jednu transakciu a vydáva session iba pôvodnému PC. Podrobnosti konfigurácie, aktivácie a fyzických kontrol sú v [návode B/C](docs/modes-b-c.md).

Nová migrácia odvolá historické relácie bez faktorových dôkazov; používatelia sa musia znova prihlásiť. Heslá a TOTP tajomstvá zostávajú zachované. Zálohy DB, šifrovacieho kľúča a CA spravujte spoločne.

## Technológie

- Webové rozhranie: React, TypeScript a Vite.
- Aplikačné programovacie rozhranie (API, Application Programming Interface): NestJS a TypeScript.
- Databáza: PostgreSQL a Prisma ORM 7.10.1.
- Mobilná aplikácia: Kotlin, Jetpack Compose, CameraX/ZXing, AndroidX Biometric a Keystore.
- Kryptografia: SimpleWebAuthn, JOSE a oficiálna Android Key Attestation knižnica v internom JVM verifieri.
- Prevádzka: Docker Compose a Caddy.

Web používa fotografiu trezorových dverí `pexels-cottonbro-8466227.jpg`. QR kód TOTP sa vytvára lokálne a možno ho pridať do kompatibilnej autentifikačnej aplikácie.

## Spustenie v lokálnej sieti

Na počítači, ktorý bude serverom, otvorte PowerShell v hlavnom priečinku projektu. Zistite jeho IPv4 adresu príkazom `ipconfig` a nahraďte ňou príklad `192.168.1.50`:

```powershell
./scripts/Start-Lan.ps1 -AppHost 192.168.1.50
```

Skript pri prvom spustení vytvorí lokálny súbor `.env` s náhodnými tajomstvami a spustí kontajnery. Súbor `.env` a obsah `infra/data/` sú určené iba pre daný počítač a Git ich ignoruje. Na prístup z iných zariadení je potrebné povoliť TCP port 443 v súkromnom profile Windows Firewallu a nainštalovať verejný koreňový certifikát lokálnej certifikačnej autority (CA, Certificate Authority) na klientskom zariadení.

Postup pre iPhone, iný počítač a pridanie webovej aplikácie na plochu je v [návode na LAN test](docs/lan-test.md). Aplikácia vyžaduje pripojenie k serveru; offline prihlásenie nepodporuje.

## Overenie

Zostavenie a typovú kontrolu spustíte príkazmi:

```powershell
pnpm build
pnpm check
pnpm check:contract
pnpm test:browser
```

Integračné testy používajú oddelenú databázu v Docker Compose:

```powershell
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
docker compose -f compose.test.yaml down
```

Po spustení LAN servera možno skontrolovať HTTPS a základné odpovede pomocou:

```powershell
node tests/https-smoke.mjs https://192.168.1.50 infra/data/bio-token-root.crt
```

Adresu v príkaze nahraďte hodnotou `APP_HOST` z `.env`. Podrobné očakávané výsledky sú v [návode na LAN test](docs/lan-test.md) a [zázname overenia](docs/verification.md).

## Dokumentácia

- [Režim A](docs/mode-a.md)
- [Režimy B/C, konfigurácia a akceptácia](docs/modes-b-c.md)
- [Android build a inštalácia](apps/android/README.md)
- [Implementačný plán](docs/implementation-plan-b-c.md)
- [HTTPS a testovanie v lokálnej sieti](docs/lan-test.md)
- [Architektúra](docs/architecture.md)
- [Prihlasovací tok](docs/authentication-flow.md)
- [Registrácia a obnova](docs/enrollment-recovery.md)
- [Model hrozieb](docs/threat-model.md)
- [Etapy a testovanie](docs/testing.md)
- [Záznam overenia](docs/verification.md)
- [Kontrakt API v OpenAPI](packages/contracts/openapi.yaml)
