# Pokračovanie na druhom zariadení

Odovzdanie z 19. októbra 2026. Tento dokument poskytuje kontext aj bez pôvodného chatu. Implementácia B/C je na `main` v commite `000b510f05b9ae14b739eb9e3e0adb880655166c`; tento návod bol pridaný následne. Pracujte s najnovším `main`, nie s pôvodným základom projektu.

## Cieľ a rozhodnutia používateľa

Používateľ chce lokálny výskumný prototyp troch režimov podľa README. Firebase bol výslovne vyradený; používa sa vlastný server v LAN cez Docker Compose, Caddy a PostgreSQL. Verejný cloudový hosting sa nepripravuje.

- A: meno/heslo, po aktivácii aj TOTP.
- B: meno/heslo a podporovaný YubiKey cez WebAuthn, s UP aj UV.
- C: samostatný discoverable YubiKey credential s UP/UV a biometricky autorizovaný podpis spárovaného Android telefónu toho istého účtu v jednej transakcii. Session dostane iba pôvodný PC.
- Povolené alternatívy určuje backend. Správa faktorov vyžaduje čerstvé overenie; existujúca C politika vyžaduje C. Obnova nesmie automaticky zapnúť slabší režim.

Práca bola rozdelená medzi koordinátora a špecializovaných agentov pre backend/WebAuthn, Android a bezpečnostné overenie. Používateľ chce týmto spôsobom pokračovať, ak sú agenti dostupní. Súčasná prekážka je fyzická: pôvodný PC nemá možnosť pripojiť USB-C token. Dostupnosť tokenu, telefónu a USB debuggingu na novom PC zatiaľ nie je potvrdená.

## Čo už je implementované

| Oblasť | Kód a správanie |
| --- | --- |
| API | NestJS; `apps/api/src/webauthn*`, `mobile*`, `session-policy.service.ts`, `auth-modules.ts` |
| WebAuthn | SimpleWebAuthn; oddelené B/C profily, kandidátska registrácia a potvrdenie, packed atestácia s dôveryhodnými rootmi a AAGUID allowlistom |
| C a párovanie | Dva mobilné kľúče, atestácia, dôkaz držby, potvrdenie porovnávacieho kódu na pôvodnom PC, jednoúčelové JWS výzvy, atomické dokončenie |
| Politika a DB | Faktorové dôkazy session, bezpečnostná verzia účtu, krátke transakcie, revokácia, audit; migrácia `202610190001_modes_b_c` |
| Web | `AdvancedLogin.tsx`, `SecurityPanel.tsx`, prihlasovanie B/C, správa faktorov a politiky, ochrana pred dokončením nového toku zo starej karty |
| Android | Skutočný Gradle projekt `apps/android`, moduly `:app`/`:core`, Compose, CameraX/ZXing, Keystore a BiometricPrompt CryptoObject; bez PIN fallbacku v approval kroku |
| Verifier | Interný JVM servis `infra/attestation`; oficiálna Android Key Attestation knižnica pripnutá na commit, hardvérová/aplikačná politika, živá kontrola revokácií |
| Kontrakt | `packages/contracts/openapi.yaml`; Kotlin používa vlastné DTO, nie TypeScript typy |
| Prevádzka | LAN skripty, predvolene vypnuté B/C, interný Compose profil `mode-c`, GitHub Actions workflow |

V migrácii sa odvolajú historické relácie bez faktorových dôkazov. Heslá a TOTP tajomstvá sa nemenia. Pred migráciou existujúcej DB treba zálohovať DB, jej TOTP šifrovací kľúč a serverovú CA. Samoobslužná obnova po strate všetkých faktorov a automatické odblokovanie nie sú implementované. `block-user` bezpečne zablokuje účet a zachová politiku.

## Dokončené overenie a jeho hranice

Lokálne prešlo: build API/web, TypeScript, 47 serverových testov so skutočným PostgreSQL, 4 Chromium testy, 13 Android JVM testov, 8 JVM policy testov verifiera, jeho HTTP smoke a OpenAPI validácia 41 ciest. Android debug APK aj instrumentation APK boli zostavené. Android lint: 0 chýb, 39 upozornení. Presné príkazy a hranice sú v [zázname overenia](verification.md) a [testovaní](testing.md).

Browserové testy majú virtuálny autentifikátor a nahradené API. Serverové testy B overujú skutočné podpisy a assertion verifier, ale úspešná registračná atestácia používa v orchestration teste testový adapter. C protokolové testy majú testovú atestačnú hranicu. Nie je to dôkaz fyzického MFA.

**Nevykonané:** fyzická YubiKey atestácia/registrácia, Android pairing a biometrický podpis, device testy, celý C tok a negatívne hardvérové skúšky. Nové DNS/HTTPS nastavenie nebolo nasadené na klientov. Výsledok vzdialeného GitHub Actions behu nebol v pôvodnom chate overený. Historický IP HTTPS smoke pre A nepotvrdzuje DNS/WebAuthn/C.

## Čo sa cez Git neprenáša

`.env`, `infra/data/`, Docker volumes, lokálne DB, CA, APK, Android SDK/JDK, `.tooling`, build výstupy a signing keystore sú ignorované. Pôvodný lokálny `.tooling` runtime bol pripravený iba na prvom PC; po klonovaní ho neočakávajte. Pri odovzdaní neexistoval v tomto pracovnom priečinku `.env` a nová migrácia bola použitá iba v dočasnej testovacej DB. Historický záznam o staršom LAN serveri nie je dôkazom, že server teraz beží.

Na novom PC zvoľte vedome jednu možnosť:

1. **PC ako klient existujúceho servera:** najprv potvrďte jeho adresu, bežiacu verziu a konfiguráciu. Git aktualizácia sama server nenasadí. PC aj Android musia dosiahnuť jeho kanonický DNS hostname a dôverovať jeho verejnej CA.
2. **Nová izolovaná testovacia inštancia na tomto PC:** pripravte nové lokálne tajomstvá, CA a testovací účet; staré účty ani párovania sa z Gitu neobnovia. Toto je vhodný východiskový postup, ak existujúci server nie je dostupný.

Existujúcu databázu nekopírujte bez jej zodpovedajúceho TOTP kľúča. Súkromný CA kľúč ani signing keystore sa cez Git alebo chat neposielajú. Pri novom serveri sa vytvorí nová CA. Nový lokálny Android debug podpis sa môže líšiť od prvého PC: server musí kontrolovať odtlačok skutočne inštalovaného APK. Neodinštalujte existujúcu spárovanú aplikáciu len na vyriešenie konfliktu podpisu; prišli by ste o jej Keystore kľúče.

## Poradie práce na novom PC

### 1. Načítajte pravidlá a overte pracovisko

Prečítajte `AGENTS.md`, tento dokument, [README](../README.md), [návod B/C](modes-b-c.md), [Android README](../apps/android/README.md), [kontrakt](../packages/contracts/openapi.yaml) a [rozhodnutie B/C](decisions/0002-modes-b-c.md). Pred zmenami kódu načítajte `docs/skills.md` a relevantné projektové skilly; pri Androide aj `.agents/README.md` a jeho referencie. Upstream generátor modulov a `make verify` tu nie sú.

Ak repozitár ešte nie je lokálne:

```powershell
git clone https://github.com/JozefKovalcin/Bio-Token-Auth-FIDO2.git
cd Bio-Token-Auth-FIDO2
```

Ak už existuje, najprv skontrolujte `git status`, zachovajte cudzie rozpracované zmeny a aktualizujte príslušný checkout cez `git pull --ff-only origin main`. Nepoužívajte reset ani force push ako riešenie rozdielov.

Overte Git, Docker Desktop s Linux enginom a pre lokálny vývoj Node.js 24+ a pnpm 11.25.0. Android potrebuje JDK 17, SDK platform 35, Build Tools 35.0.0 a platform-tools/ADB. Wrapper je v Gite. Overte reálny model/firmware YubiKey, podporu FIDO2/UV a stav telefónu Android 11+ so zapísaným silným odtlačkom. Používateľ vykonáva dotyk tokenu, PIN a biometrický súhlas sám; tajomstvá sa nevypisujú. Token neresetujte.

### 2. Pripravte LAN, DNS a TLS

Zvoľte stabilný hostname, predvolene `auth.bio-token.test`, dostupný z PC aj telefónu. DNS nastavte na skutočný server; Windows hosts na jednom PC nestačí pre Android. Najprv skontrolujte existujúce `.env`, nikdy ho neprepisujte generátorom.

Pre **novú** inštanciu po príprave DNS:

```powershell
./scripts/Start-Lan.ps1 -AppHost auth.bio-token.test
```

Skript vytvorí lokálnu konfiguráciu, ak neexistuje, a spustí zostavu s vypnutými B/C. Dôveru verejnej CA na PC a Android nastavte podľa LAN/Android návodov; nevypínajte kontrolu TLS. DNS, firewall a dôveryhodné úložisko sú nastavenia konkrétneho zariadenia a siete, nie údaje obnovené z Gitu. Najprv overte HTTPS a regresiu A.

### 3. Najprv fyzicky overte B

Podľa [návodu B/C](modes-b-c.md) získajte root certifikáty a AAGUID z oficiálnych dôveryhodných zdrojov pre skutočný model. Nedopĺňajte odhadnuté hodnoty a neprijímajte koreň dodaný registračnou požiadavkou. Až po konfigurácii zapnite `WEBAUTHN_ENABLED`.

Na testovacom účte zaregistrujte B credential, potvrďte kandidáta a povoľte B politikou. Otestujte heslo + YubiKey, odmietnutie nesprávneho hesla/PIN, zrušenie, chýbajúci token, replay a expiráciu. PIN nehádajte opakovanými pokusmi až do zablokovania tokenu. Ak reálna atestácia neprejde, diagnostikujte podporu/model/reťazec/origin; neoslabujte validáciu, aby test prešiel.

### 4. Zostavte Android a overte hardvérové predpoklady C

Pre lokálne softvérové overenie z koreňa projektu:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm check:contract
./apps/android/scripts/Verify-Android.ps1 -ServiceOrigin https://auth.bio-token.test
```

Android skript neinštaluje SDK/JDK. Výstup APK je `apps/android/app/build/outputs/apk/debug/app-debug.apk`. Overte jeho application ID a verejný SHA-256 odtlačok podpisového certifikátu; debug ID je `sk.biotoken.android.debug`. Konfigurácia verifiera musí zodpovedať tomuto APK, nie predvolenej release hodnote. Zostavovaný origin sa musí zhodovať so serverom.

Po autorizovaní USB debuggingu overte `adb devices` a nainštalujte APK podľa Android README. Device testy sú dostupné cez `Verify-Android.ps1 -ConnectedDevice`; vyžadujú reálne pripojené zariadenie. `DeviceKeysTest` overuje niektoré Keystore predpoklady a odmietnutie neautorizovaného podpisu, ale sám nespúšťa plný úspešný biometrický tok ani neoveruje serverovú atestáciu. Preskočenie testu neznamená úspech. Skutočný CryptoObject podpis so zapísaným odtlačkom a negatívne skúšky sa musia vykonať osobitne.

### 5. Párovanie a celý C tok

Nastavte interný verifier podľa `infra/attestation/README.md` vrátane skutočného APK podpisu. Vyžaduje živé dôveryhodné revokačné údaje; jeho port ani bearer secret nepublikujte. Až po základnom fyzickom overení postupujte podľa brány v `docs/modes-b-c.md`: obe C nastavenia zapnite iba v izolovanom akceptačnom prostredí a dokončite skutočný end-to-end protokol. Nepoužívajte testové fixtures v prevádzkovom API.

Zaregistrujte samostatný discoverable C credential, vykonajte C YubiKey proof pri párovaní, mobilnú atestáciu oboch kľúčov a potvrďte rovnaký porovnávací kód na pôvodnom PC. Vykonajte skúšobný C tok pred zmenou politiky účtu. Overte odtlačok bez PIN fallbacku, odmietnutie, zrušenie, expiráciu, staré QR, iný účet/transakciu, súbeh a odvolanie. Až následne skúšajte účet s politikou iba C. Na testy zmeny biometrického zápisu/reinštalácie použite vyhradený testovací účet a zariadenie; môžu zneplatniť existujúce kľúče.

### 6. Opravte skutočne zistené problémy a odovzdajte výsledky

Nevytvárajte druhý scaffold namiesto existujúcej implementácie. Pri chybách zachovajte bezpečnostné požiadavky, doplňte primeraný regresný test a znovu spustite dotknuté kontroly podľa `docs/testing.md`. Nevyhlasujte minulý test za aktuálny beh na novom PC.

Do `docs/verification.md` pridajte nový datovaný záznam. Uveďte commit, OS/browser, model/firmware YubiKey, Android model/verziu, verejnú identitu APK a pre každý fyzický scenár PASS/FAIL/NEVYKONANÉ s neprivátnou príčinou. Nepridávajte tokeny, QR, heslá, OTP, privátne kľúče, biometrické dáta ani neupravené request logy. Pri neúspechu nechajte príslušný režim vypnutý a popíšte presnú prekážku.

## Prompt pre nový chat

Skopírujte nasledujúci text do Codex chatu otvoreného v tomto repozitári:

```text
Pokračuj na projekte Bio-Token-Auth-FIDO2 z aktuálneho main. Nemáš pôvodný chat; kompletné odovzdanie je v docs/handoff-next-device.md. Najprv načítaj AGENTS.md, tento návod a jeho relevantné odkazy/skilly. B/C už majú implementované API, web, Android a atestačný verifier; ďalším cieľom je konfigurácia nového zariadenia a fyzické overenie B, potom C. Firebase nepoužívaj.

Skontroluj pracovný strom, nástroje a skutočnú dostupnosť YubiKey/Androidu. Najprv zisti, či použijeme existujúci LAN server alebo novú izolovanú testovaciu inštanciu; pokiaľ to nemožno vyčítať z lokálneho prostredia, opýtaj sa ma a pokračuj nezávislou prípravou. Neprenášaj predpoklad, že zariadenia sú zapojené alebo že pôvodný lokálny .env, SDK, APK či CA sú v Gite. Postupuj podľa návodu, priprav konkrétne kroky a pri fyzickom dotyku/PIN/biometrii ma naveď bez získavania tajomstiev.

Použi dostupných špecializovaných agentov pre nezávislé backend/WebAuthn, Android a bezpečnostné úlohy s oddeleným vlastníctvom súborov. Zachovaj povinné oba faktory C toho istého účtu v jednej transakcii a session iba na pôvodnom PC. Neoslabuj atestáciu, TLS, UP/UV ani recovery politiku a neresetuj token. B/C povoľuj iba podľa zdokumentovaných brán. Oprav nájdené problémy, vykonaj primerané automatické aj fyzické kontroly a zapíš skutočné výsledky do docs/verification.md oddelene od minulých testov a nevykonaných scenárov. Pokračuj až po overenie alebo konkrétnu prekážku vyžadujúcu moju súčinnosť.
```
