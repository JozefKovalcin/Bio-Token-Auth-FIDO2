# Záznam overenia

Overenie režimu A prebehlo 18. októbra 2026. Testy používali oddelenú databázu PostgreSQL v dočasnej Docker Compose zostave. Produkčné dáta a lokálna databáza aplikácie neboli súčasťou testov.

## Automatické kontroly

Zostavenie cez `pnpm build` a typová kontrola cez `pnpm check` prešli. Testovacia zostava aplikovala databázovú migráciu a spustila 19 integračných testov. Všetkých 19 prešlo; žiadny test nebol preskočený.

Pokryté boli registrácia, jedinečnosť mena, dĺžka hesla, prihlasovanie pred aktiváciou TOTP, vytvorenie QR, aktivácia faktora, následné prihlásenie s TOTP, limity pokusov, expirácia, ochrana `Origin` a cookies, súbežné dokončenie, odhlásenie a opakované použitie kódu. Tieto testy overujú režim A; nepotvrdzujú funkčnosť plánovaných režimov B/C ani Android klienta.

## HTTPS a lokálna sieť

Príkaz `node tests/https-smoke.mjs https://192.168.77.5 infra/data/bio-token-root.crt` prešiel. Overil reťazec TLS (Transport Layer Security), zhodu adresy IP certifikátu, HTTPS web a API, neprihlásený prístup, ochranu proti falšovaniu požiadaviek medzi webmi (CSRF, Cross-Site Request Forgery), hlavičku CSP (Content Security Policy) a presmerovanie HTTP. Pri IP adrese test osobitne overil aj spojenie bez SNI (Server Name Indication).

Caddy používa lokálnu certifikačnú autoritu uloženú v Docker volume. iPhone a ďalší klienti musia dostať jej verejný koreňový certifikát a používateľ musí v iOS zapnúť plnú dôveru pre TLS. Profil `infra/data/bio-token-ios-ca.mobileconfig` a certifikát `infra/data/bio-token-root.crt` patria do lokálnej konfigurácie a Git ich ignoruje.

## Rozsah overenia

Testy potvrdzujú aktuálne správanie na počítači servera a v izolovanej testovacej databáze. Prihlásenie na fyzickom iPhone, dôveru certifikátu na konkrétnom zariadení a pridanie ikony na plochu treba overiť samostatne podľa [návodu na LAN test](lan-test.md). Režimy B/C a Android klient nie sú implementované.
