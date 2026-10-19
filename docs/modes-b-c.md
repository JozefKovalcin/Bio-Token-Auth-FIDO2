# Prevádzka a overenie režimov B/C

Implementácia používa lokálnu LAN bez cloudového hostingu. Pred zapnutím faktorov najprv zálohujte databázu, TOTP šifrovací kľúč a Caddy CA. Nová migrácia odvolá existujúce relácie, preto sa používatelia musia prihlásiť znova. TOTP tajomstvá a heslá zostávajú zachované.

## DNS a HTTPS

Na routeri alebo lokálnom DNS serveri nastavte napríklad `auth.bio-token.test` na LAN IP servera. Meno musí vyriešiť PC aj Android; zmena iba Windows hosts súboru nepomôže telefónu. Nastavte `APP_HOST` na toto meno, `WEBAUTHN_RP_ID` na rovnaké meno bez schémy/portu a používajte jednu kanonickú adresu. Caddy vystaví certifikát pre tento hostname. Verejnú lokálnu CA importujte podľa `lan-test.md`; súkromný CA kľúč sa neprenáša. Žiadne ignorovanie TLS chýb.

Existujúci `.env` neprepisujte generátorom. Upravte adresu a nové nastavenia podľa `.env.example`, pričom zachovajte heslo DB a TOTP šifrovací kľúč. Nové konfigurácie vytvára `scripts/Init-Lan.ps1 -AppHost auth.bio-token.test` s náhodnými lokálnymi tajomstvami a predvolene vypnutými B/C. Nastavenia DNS ani úložiska dôvery klienta skript nemení.

## Aktivácia WebAuthn a režimu B

1. Z dôveryhodných oficiálnych Yubico/FIDO metadát získajte schválené verejné root certifikáty pre podporovaný model. Neimportujte koreň dodaný používateľom počas registrácie. Overte pôvod a platnosť certifikátov.
2. Uložte JSON pole PEM certifikátov do lokálneho ignorovaného `infra/data/webauthn-roots.json`. Compose ho sprístupní API read-only na `/config/webauthn-roots.json`. Ak model dodáva iba leaf certifikát, z dôveryhodných oficiálnych metadát získajte aj jeho verejné medziľahlé CA a uložte ich oddelene do `infra/data/webauthn-intermediates.json`; nastavte voliteľné `WEBAUTHN_INTERMEDIATES_FILE=/config/webauthn-intermediates.json`. Tieto certifikáty tvoria iba pomocný issuer pool, nie nové trust anchors. Do root súboru ich nepridávajte. Bez nakonfigurovaného poolu zostáva overenie pri neúplnom reťazci bezpečne odmietnuté.
3. Do `WEBAUTHN_AAGUID_ALLOWLIST` vložte overené AAGUID podporovaných modelov oddelené čiarkou. Samotný AAGUID bez validovanej atestácie nestačí.
4. Nastavte `WEBAUTHN_ENABLED=true` a reštartujte zostavu. Chybné alebo chýbajúce trust nastavenie spôsobí bezpečné zlyhanie spustenia WebAuthn.
5. Prihláste účet podľa aktuálnej politiky. V správe zabezpečenia vykonajte čerstvé overenie, registráciu YubiKey pre B a následné potvrdenie kandidátskeho kľúča.
6. Až potom povoľte B v politike účtu. Zmena odvolá session; zvoľte B a overte heslo aj YubiKey. Zrušenie, nesprávny PIN ani neplatná assertion nesmú vytvoriť session.

Bez zapnutého B zostáva pôvodný režim A dostupný podľa politiky účtu. TOTP v A sa pri prihlásení B automaticky nestáva tretím faktorom. Prihlásenie B nemožno dokončiť cez endpoint TOTP.

## Android a atestačný verifier

Postup zostavenia, konfigurácie dôveryhodného originu a inštalácie APK je v `apps/android/README.md`. Použite známy podpisový certifikát aplikácie; jeho SHA-256 odtlačok sa konfiguruje na serveri. Privátny podpisový kľúč APK ani Android Keystore kľúče nepatria do repozitára.

Verifier v `infra/attestation` používa oficiálnu Android knižnicu na overenie hardvérovej atestácie a certifikačných revokácií. Vyžaduje dostupnosť dôveryhodných revokačných údajov; ich výpadok nesmie viesť k prijatiu neovereného kľúča. Verifier je interný, jeho port nepublikujte. `ATTESTATION_SERVICE_TOKEN` je náhodné lokálne tajomstvo zdieľané iba API a verifierom.

Nastavte `ATTESTATION_PACKAGE_NAME`, `ATTESTATION_SIGNING_CERT_SHA256` a prípadne minimálnu verziu aplikácie podľa skutočného APK. Vývojový certifikát ani vlastnosti telefónu nemožno odhadnúť zo vzorových hodnôt. Spustenie verifiera:

```powershell
docker compose --profile mode-c up --build -d --wait
```

`MODE_C_ENABLED` a `MODE_C_HARDWARE_VERIFIED` majú predvolenú hodnotu `false`. Najprv na fyzickom zariadení overte základné hardvérové predpoklady: podporovaný YubiKey s UP/UV, odtlačok cez CryptoObject bez PIN fallbacku, hardvérovú ochranu kľúčov a známu identitu APK. Device test `DeviceKeysTest` je pomocná kontrola; preskočený test nepreukazuje podporu. Výsledky zaznamenajte. Až po tomto overení nastavte obe hodnoty na `true` v izolovanom akceptačnom prostredí s testovacím účtom a dokončite celý protokol nižšie cez skutočný verifier. Do prevádzky C povoľte až po jeho úspešnom dokončení; pri neúspechu ho opäť vypnite. Automatické fixtures túto hardvérovú bránu nesplnia. Produkčné testové bypassy ani fake atestačný provider neexistujú; test fixtures v automatických testoch sa používajú iba v teste.

## Fyzický akceptačný protokol C

Zaznamenajte dátum, verziu aplikácie/servera, model a firmware YubiKey, PC OS/prehliadač, model telefónu a verziu Androidu. Tieto výsledky nie sú zatiaľ v repozitári potvrdené.

- Na vybranom telefóne preukážte podpis cez CryptoObject autorizovaný skutočným silným odtlačkom. `BIOMETRIC_STRONG` môže zahŕňať aj inú Class 3 biometriu; samotné API nepreukazuje výhradne odtlačok.
- Overte zrušenie, chybnú biometriu a lockout. Žiadny PIN/heslo obrazovky nesmie schváliť approval podpis.
- Overte serverovú atestáciu oboch kľúčov, priradenie k správnemu APK a bezpečné odmietnutie nesprávnej challenge alebo podpisového certifikátu aplikácie.
- Zaregistrujte a potvrďte samostatný C credential. Čerstvo overený účet vytvorí pairing po C YubiKey proof. Telefón preukáže držbu kľúčov; rovnaký porovnávací kód musí potvrdiť pôvodný PC. Iný kandidát/účet/prehliadač neprejde.
- Vykonajte skúšobný C tok pred aktiváciou C politiky. Mobilné schválenie nesmie vytvoriť webovú session; iba pôvodný PC dokončí transakciu. C politika sa zapne až na základe tohto dôkazu.
- Skontrolujte expirácie, replay, nový flow so starým QR, odmietnutie, výpadok siete a dve súbežné dokončenia. Úspešná transakcia vytvorí najviac jednu session.
- Overte zmenu/odstránenie biometrického zápisu, zneplatnenie Keystore kľúča, odvolanie telefónu/YubiKey a správanie po reštarte/reinštalácii. Nový kľúč vyžaduje nové kontrolované párovanie.
- Na účte s povoleným iba C overte odmietnutie A, B a starých slabších relácií. Samotný YubiKey, telefón alebo QR nestačí.

## Obnova a prevádzka

Záložný kľúč aj telefón pripravte pred stratou faktorov. Odvolanie posledného potrebného faktora je bezpečne odmietnuté; systém automaticky nezapne A/B. Samoobslužná obnova cez e-mail nie je dostupná.

Pri strate potrebných faktorov môže správca v serverovom prostredí spustiť `pnpm block-user --username MENO` (v Compose `docker compose exec api pnpm block-user --username MENO`). Príkaz atomicky zablokuje účet, odvolá jeho relácie a rozpracované operácie a zaznamená zásah do auditu; zachová politiku. Identitu vlastníka treba overiť mimo prihlasovacieho toku. Nemeňte `allowedModes` priamo v DB na slabší režim ako pomocný spôsob prihlásenia. Nové faktory sa musia zaregistrovať kontrolovaným enrollmentom zodpovedajúcim politike; pri nedokončenom recovery postupe účet zostane zablokovaný. Príkaz na automatické odblokovanie či slabšie recovery prihlásenie zámerne nie je dostupný.

Audit obsahuje klasifikované serverové udalosti a interné ID, bez hesiel, OTP, tokenov, QR obsahu a biometrických údajov. Správca musí určiť retenciu a zálohovanie. Čas servera aj telefónu musí byť synchronizovaný. Stav a expirácia sa kontrolujú pri každej operácii; cleanup nie je bezpečnostná podmienka platnosti.

Automatické overenie: `pnpm build`, `pnpm check`, `pnpm check:contract`, izolovaný `compose.test.yaml`, `pnpm test:browser` a Android tasky uvedené v jeho README. Výsledky, fyzické kroky a nevykonané kontroly evidujte oddelene.
