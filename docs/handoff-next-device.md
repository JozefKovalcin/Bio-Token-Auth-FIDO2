# Pokračovanie na druhom zariadení

## Fyzické C na notebooku — 2. november 2026

Na zachovanej izolovanej inštancii prešiel skutočný lokálny odtlačok/CryptoObject podpis aj cancel, nová C registrácia/aktivácia YubiKey, hardvérová atestácia oboch mobilných kľúčov, PC potvrdenie párovania, C trial a následné prihlásenie C. Server potvrdil `webauthn + mobile`, oba dôkazy toho istého účtu a jednu session z dokončenej C transakcie. Detaily, časy a nevykonané negatívne scenáre sú vo [verification.md](verification.md). Ide o základný pozitívny fyzický tok, nie automatické potvrdenie všetkých bezpečnostných skúšok.

Aktuálna LAN IP je `192.168.68.120/22`; lokálny DNS a úzko viazané Windows/Hyper-V pravidlá boli aktualizované bez rozšírenia portov alebo podsiete. Telefón má aktuálny debug APK s pôvodným signerom; jeho kontrola hlási REACHABLE. Používateľ povolil Inštalovať cez USB pre nasadenie test APK; na bežné C prihlásenie USB ladenie ani test APK netreba. A/B/C sú lokálne zapnuté a politika testovacieho účtu obsahuje A/B/C; vzorové konfigurácie v Gite sa tým nezapínajú. Aktuálny oficiálny FIDO MDS 294 bol podpisovo overený, nextUpdate 1.12.2026, bez compromise/revoked reportu pre model.

Používateľ požiadal uložiť postup aj zmeny do Gitu. Praktické príkazy pre zachované prostredie sú v [spustenie-vypnutie.md](spustenie-vypnutie.md). `.env`, volumes, CA, privátny signing setup a lokálny DNS runtime zostávajú mimo Gitu. Pri pokračovaní ich zachovajte; negenerujte novú DB/CA ani neodinštalujte spárovanú aplikáciu.

Po fyzickom C bola opravená aj zastaraná dostupnosť C v prihlasovacom menu po logout: capabilities sa znovu načítajú pri návrate na login s AbortController ochranou. Nová regresia pred opravou FAIL, po oprave všetkých 8 browserových testov PASS, TypeScript/build PASS; opravený web je nasadený. Backendové bezpečnostné brány sa nemenili. Projekt zostal používateľovi spustený, samotné uloženie návodu nevykonalo vypnutie.

## Rozsah školského dema a finálne doladenie webu — 2. november 2026

Používateľ chce školskú úlohu A/B/C; obnova účtov a produkčný hosting sa teraz neimplementujú. Začnite [návodom pre notebook](demo-quickstart.md), ktorý má konkrétne príkazy a poradie skúšok. Web bol doladený vizuálne aj funkčne: režimové texty a kroky, registrácia z B/C, návraty/zrušenie, konzistentné karty/tlačidlá/checkboxy, kandidátske a politické akcie. Najnovšie browserové overenie je **7/7 PASS**, build a TypeScript PASS; fyzické C sa tým nenahrádza. Pri ďalšej práci nerozširujte školské zadanie o recovery alebo verejný cloud. Zachovajte oba skutočné faktory C a existujúce trust brány.

## Pokračovanie C — 2. november 2026

Aktuálny `main` `c12736f` bol načítaný fast-forward na pôvodnom PC. Používateľ potvrdil, že teraz nemá telefón ani token a chce pokračovať softvérovo. Nasledujúce zmeny nadväzujú na implementáciu a fyzické B nižšie; nevydávajú sa za fyzické C.

- Android má pred QR kontrolu spojenia s pevným HTTPS originom: tlačidlo **Overiť spojenie so serverom**, bezpečné kódy DNS/TLS/hostname/timeout/HTTP, bez cookies, QR a autorizácie. Toto je prvý krok pri pokračovaní predchádzajúcej nejasnej HTTPS chyby telefónu. `REACHABLE` nepotvrdzuje biometriu ani atestáciu.
- Vypršaný podpisový súhlas má stav `EXPIRED`; neskorý biometrický callback sa neodosiela. Uložené párované kľúče sa zachovávajú. Kandidát bez živého párovania je po autorizovanej kontrole stavu serverom bezpečne odvolaný; používateľ môže potom explicitne odstrániť jeho miestne kľúče a opakovať pairing. Aktívny telefón zostáva nedotknutý.
- Web po vypršaní zruší aj formulár už zobrazeného kandidáta. API číta odpovede interného verifiera s reálnymi byte limitmi a pred zápisom kandidáta overí úplný serverový evidence kontrakt.
- Aktuálne softvérové kontroly: **64/64 serverových, 5/5 browserových, 25/25 Android JVM testov**, build API/web a Android aplikácie/test APK, formátovanie, OpenAPI a lint PASS (0 chýb/40 upozornení). Podrobnosti a hranice sú vo [verification.md](verification.md). Device/Compose ani celý C tok sa na tomto PC nespúšťali.

Nasleduje overenie nového APK na testovacom telefóne, presná kontrola jeho podpisovej identity a sieťová diagnostika, potom existujúci offline biometrický test a skutočné C párovanie podľa brány v `modes-b-c.md`. APK z pôvodného PC môže mať iný debug signer než aplikácia na druhom PC; neodinštalovať spárovanú aplikáciu ani neposielať privátny signing kľúč ako skratku. Lokálna konfigurácia druhého PC zostáva mimo Gitu. B/C predvolené flagy sa touto prácou nezapínajú.

## Uložený stav po fyzickom B — 19. október 2026

Práca bola na žiadosť používateľa odložená a odoslaná do Gitu. Táto časť opisuje najnovší stav; pôvodný odovzdávací návod nižšie zachytáva východiskový stav pred týmto overením. Presné výsledky a hranice sú v [docs/verification.md](verification.md).

- Na novom Windows PC vznikla nová izolovaná LAN inštancia. **B fyzicky PASS:** Yubico Security Key C NFC 5.8.0, registračná atestácia, potvrdenie kandidáta a prihlásenie heslom + YubiKey cez UP/UV. Nesprávne heslo a kombinovaný chýbajúci token/zrušenie boli odmietnuté; následne 0 platných sessions. Nesprávny PIN, fyzický replay/expirácia/súbeh sa nevykonali.
- Opravené skutočné zlyhanie neúplnej Yubico certifikačnej cesty: voliteľný `WEBAUTHN_INTERMEDIATES_FILE` dopĺňa overených issuerov zo samostatného serverového poolu, bez rozšírenia root trustu alebo zmeny podpísaného payloadu. Plná knižničná validácia zostáva povinná. API kontrola a 53/53 izolovaných serverových testov prešli; bezpečnostné review PASS.
- Telefón Xiaomi 2406APNFAG, Android 16/API 36, má skutočne nainštalovaný `sk.biotoken.android.debug`. Hash jeho nainštalovaného APK bol porovnaný so zostavou, signer je zaznamenaný vo verification. Predchádzajúce hlásenia o chýbajúcej aplikácii sú už vyriešené; neopakovať túto diagnostickú slučku.
- Telefón prekladá `auth.bio-token.test` na `192.168.68.108`. Vyžadoval Wi-Fi DNS na tento LAN server a prepnutie pevného poskytovateľa Súkromného DNS na Automatický. Používateľ oznámil import verejnej CA, ale posledné HTTPS hlásenie bolo nepresné („nemám HTTPS“). **Dôvera HTTPS telefónu ešte nie je PASS:** pri pokračovaní získať presný chybový text/kód na plnej adrese `https://auth.bio-token.test/`; neobchádzať TLS.
- **C zostáva vypnuté**, oba flagy `false`; C credential, mobilná atestácia/párovanie, odtlačok aj celý C tok sa ešte nevykonali. Interný verifier bol pripravený pre identitu skutočného debug APK; health 200 nepreukazuje CRL ani úspešnú atestáciu, port nebol publikovaný.
- Existujúce device testy nepreukazujú úspešný odtlačok. Nový oddelený opt-in `OfflineBiometricPromptTest`/`OfflineBiometricRunner` je iba v test APK, bez siete, účtu, session alebo zmeny C gate. Používa dočasné kľúče, skutočný CryptoObject a lokálne overenie podpisu, potom samostatný cancel. Build, Spotless, lint (0 chýb/40 upozornení), signer aj výsledný manifest prešli; bezpečnostné review PASS. **Fyzicky sa nespustil.** Postup je v [Android README](../apps/android/README.md). Test APK je už prenesený do telefónu ako `Download/bio-token-device-test.apk`, zatiaľ nenainštalovaný; testovací balík nemá slúžiť ako druhá bežná aplikácia.

Pri zatvorení sa zastavujú iba projektové Compose služby, vlastný lokálny CoreDNS, projektový ADB a Gradle daemony; volumes, `.env`, verejné trust podklady, CA, SDK a APK sa nemažú. Tieto lokálne súbory sú ignorované a **nie sú zálohované Gitom**. Na tom istom PC nespúšťať `Init-Lan.ps1` cez existujúcu konfiguráciu, nevytvárať ďalšiu DB/CA ani neodinštalovať aplikáciu. Používateľ bol vyzvaný vrátiť Wi-Fi IP/DNS telefónu na DHCP, pretože lokálny DNS sa zastaví; vykonanie tohto kroku nebolo automaticky potvrdené.

Pokračovanie na rovnakom PC: najprv načítať pravidlá/skilly, skontrolovať aktuálnu LAN IP a zachované lokálne nastavenia, obnoviť vlastný DNS pomocou existujúceho ignorovaného `.tooling/start-local-dns.ps1` a projektové služby cez `docker compose --profile mode-c up -d --wait`. Tento Compose profil spúšťa interný verifier, sám nezapína C. Pri zmene LAN IP najprv upraviť lokálny DNS/firewall podľa návodu. Obnoviť DNS telefónu pre test, vyriešiť presnú HTTPS chybu, vedome nainštalovať test APK a vykonať oba kroky lokálneho biometrického testu; až po splnení základnej brány postupovať na izolované C párovanie. Na inom PC sú potrebné nové vedomé prevádzkové rozhodnutia; lokálne tajomstvá sa cez chat ani Git neprenášajú.

## Pôvodný východiskový návod

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
