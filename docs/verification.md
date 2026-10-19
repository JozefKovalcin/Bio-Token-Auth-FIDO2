# Záznam overenia

## 19. október 2026 — implementácia B/C

Softvérové overenie prebehlo lokálne. Produkčné dáta neboli migrované; testovacia zostava používala samostatný PostgreSQL s dočasným úložiskom. Režimy B/C zostávajú v predvolenej konfigurácii vypnuté. Používateľ potvrdil, že fyzický YubiKey a telefón zatiaľ nie sú pripravené na skúšky.

| Kontrola | Výsledok |
| --- | --- |
| `pnpm build` | API a web zostavené, tiež pri Docker zostavení testov |
| `docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests` | Obe migrácie a TypeScript kontroly úspešné; **47/47 testov**, bez preskočenia |
| `pnpm check:contract` | OpenAPI validné, 41 ciest |
| `pnpm test:browser` | **4/4 Chromium testy** |
| `apps/android/scripts/Verify-Android.ps1` | Formátovanie, **13/13 JVM testov**, lint a zostavenie aplikácie aj instrumentation APK úspešné |
| `docker build -t bio-attestation-check infra/attestation` | Verifier zostavený, **8/8 JVM policy testov** |
| `node tests/attestation-smoke.mjs` | Health, interná autorizácia a odmietnutie chybných atestačných/trust vstupov úspešné |
| `pnpm audit --prod` | Bez známych zraniteľností v tomto behu |
| `git diff --check` | Bez chýb whitespace |

Serverové testy pokrývajú regresiu A, skutočné EC podpisy a WebAuthn assertion verifier pre B, kontrolu originu/RP ID/challenge/UP/UV a mapovania účtu, replay, expiráciu a súbeh. C testy používajú skutočné JWS podpisy a testovú atestačnú hranicu; overujú párovanie, oba faktory toho istého účtu, pôvodný PC, revokáciu, zmenu certifikačnej dôvery, starú kartu prehliadača a atomické dokončenie. HTTP testy zahŕňajú oddelenie native/browser autorizácie, limity JSON a ochranu obsahu chybného vstupu pred odhalením.

Browserové testy používajú virtuálny WebAuthn autentifikátor a nahradené API. Registračné orchestration testy servera používajú testový trust adapter; skutočný adapter samostatne odmieta none/self attestation. Tieto výsledky nepotvrdzujú úspešnú atestáciu fyzického YubiKey ani Android zariadenia.

Android bol zostavený s JDK 17 a SDK 35 pre `https://auth.bio-token.test`. Výstup je `apps/android/app/build/outputs/apk/debug/app-debug.apk`. Lint skončil bez chýb s 39 upozorneniami; nejde o úplne čistý lint report. Instrumentation APK je zostavený, device/Compose testy neboli lokálne spustené. Nové GitHub Actions workflow je pripravené, jeho vzdialený beh nebol overený.

**Nevykonané:** fyzická registrácia a atestácia YubiKey, párovanie skutočného telefónu, biometrický CryptoObject podpis, negatívne hardvérové skúšky a celý C tok cez lokálny DNS/HTTPS. Nová DNS/CA konfigurácia nebola nasadená na klientoch; historický IP HTTPS smoke nižšie tieto kontroly nenahrádza. Postup je v [návode B/C](modes-b-c.md). Samoobslužná obnova po strate všetkých faktorov ani automatické odblokovanie účtu nie sú dodané; bezpečné administrátorské zablokovanie zachová politiku.

## Historické overenie — 18. október 2026

Overenie režimu A prebehlo 18. októbra 2026. Testy používali oddelenú databázu PostgreSQL v dočasnej Docker Compose zostave. Produkčné dáta a lokálna databáza aplikácie neboli súčasťou testov.

## Automatické kontroly

Zostavenie cez `pnpm build` a typová kontrola cez `pnpm check` prešli. Testovacia zostava aplikovala databázovú migráciu a spustila 19 integračných testov. Všetkých 19 prešlo; žiadny test nebol preskočený.

Pokryté boli registrácia, jedinečnosť mena, dĺžka hesla, prihlasovanie pred aktiváciou TOTP, vytvorenie QR, aktivácia faktora, následné prihlásenie s TOTP, limity pokusov, expirácia, ochrana `Origin` a cookies, súbežné dokončenie, odhlásenie a opakované použitie kódu. Tieto testy overujú režim A; nepotvrdzujú funkčnosť plánovaných režimov B/C ani Android klienta.

## HTTPS a lokálna sieť

Príkaz `node tests/https-smoke.mjs https://192.168.77.5 infra/data/bio-token-root.crt` prešiel. Overil reťazec TLS (Transport Layer Security), zhodu adresy IP certifikátu, HTTPS web a API, neprihlásený prístup, ochranu proti falšovaniu požiadaviek medzi webmi (CSRF, Cross-Site Request Forgery), hlavičku CSP (Content Security Policy) a presmerovanie HTTP. Pri IP adrese test osobitne overil aj spojenie bez SNI (Server Name Indication).

Caddy používa lokálnu certifikačnú autoritu uloženú v Docker volume. iPhone a ďalší klienti musia dostať jej verejný koreňový certifikát a používateľ musí v iOS zapnúť plnú dôveru pre TLS. Profil `infra/data/bio-token-ios-ca.mobileconfig` a certifikát `infra/data/bio-token-root.crt` patria do lokálnej konfigurácie a Git ich ignoruje.

## Rozsah overenia

V tomto historickom behu sa overoval iba režim A. Prihlásenie na fyzickom iPhone, dôveru certifikátu na konkrétnom zariadení a pridanie ikony na plochu treba overiť samostatne podľa [návodu na LAN test](lan-test.md). Stav implementácie B/C a Android klienta opisuje novší záznam vyššie.
