# Záznam overenia

## 19. október 2026 — nové Windows pracovisko, priebežná akceptácia

**Stav pri odložení práce na žiadosť používateľa:** B má nižšie uvedené fyzické výsledky PASS; C je stále vypnuté a fyzicky nevykonané. Projektové Compose služby boli zastavené cez `docker compose --profile mode-c down` bez `-v`, lokálny vlastný CoreDNS zastavený, aplikácia na telefóne zavretá bez mazania dát a projektový ADB server ukončený. Gradle `--stop` hlásil, že nebeží žiadny daemon. Projektová karta a zostávajúce prázdne Chrome karty boli zavreté. Databáza, CA, `.env`, lokálne nástroje a artefakty zostávajú zachované a ignorované Gitom. Telefón bol potrebné vrátiť na Wi-Fi DHCP po zastavení lokálneho DNS; používateľ dostal pokyn, vykonanie nepotvrdené. Miesto pokračovania je na začiatku [odovzdávacieho návodu](handoff-next-device.md).

Východiskový checkout: aktuálny `main`, `15a2ec2` (zhodný s požadovaným commitom). Používateľ zvolil **novú izolovanú inštanciu na tomto PC**. V klone neexistoval `.env`, databáza ani CA; vytvorili sa nové lokálne tajomstvá a Docker volumes. Firebase sa nepoužíva. Nasledujúce výsledky sú z nového behu, oddelené od historických výsledkov nižšie.

Pracovisko: Windows 11 Home 64-bit, `10.0.26200`, Docker Desktop Linux engine/WSL 2 v mirrored režime, Compose `v2.32.4-desktop.1`. Git `2.47.1.windows.2`. Globálny PATH nemal Node/pnpm/ADB; pre softvérové kontroly sa použili dostupný Node `24.19.0`, pnpm `11.25.0` a izolované Android nástroje. Prehliadač fyzickej akceptácie je Chrome `154.0.8037.93` (verzia lokálneho executable).

| Aktuálna kontrola | Výsledok a hranica |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; 362 balíkov, lockfile nezmenený |
| `pnpm build`, `pnpm check` | PASS; API/web a TypeScript; Vite hlásil ignorované `use client` direktívy v lucide-react |
| `pnpm check:contract` | PASS; 41 ciest |
| `pnpm test:browser` | PASS 4/4 po doplnení lokálneho Chromium; virtuálny autentifikátor a nahradené API, bez fyzického dôkazu |
| `docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests` | PASS 47/47, 0 skipped, obe migrácie; samostatný dočasný PostgreSQL, potom `down` bez zásahu do LAN volumes |
| Android `Verify-Android.ps1` | PASS; Spotless, core 9 + app 4 JVM testy, 0 skipped, lint 0 chýb/40 upozornení, debug aj instrumentation APK; 95 taskov |
| Android prostredie | Temurin `17.0.20.1+1`, Gradle `8.11.1`, SDK platform 35, Build Tools `35.0.0`, ADB `37.0.1`, izolované v `apps/android/.tooling`; JDK aj command-line tools SHA256 porovnané s oficiálnym zdrojom; používateľ výslovne prijal SDK licenciu |
| Unicode cesta Android buildu | AGP odmietol názov priečinka s diakritikou; úspešný beh cez dočasný ASCII SUBST alias, následne odstránený; kontrola cesty ani bezpečnostné validácie sa nevypínali |
| Nový LAN server | PostgreSQL, API a Caddy zostavené/spustené; nová CA, iba webové porty publikované; interný verifier zatiaľ nespustený |
| TLS/API z Windows | PASS: `Invoke-RestMethod https://auth.bio-token.test/api/health` s bežnou dôverou certifikátu; Chrome zobrazil aplikáciu bez TLS interstitialu |
| HTTPS smoke v sieti Caddy | PASS s explicitným routovaním kanonického hostname na Caddy; overené CA/hostname, web/API, 401/403, CSP a redirect; nie je to dôkaz klientského LAN DNS |
| Úplný HTTPS smoke cez Windows loopback | FAIL na HTTP redirect: port 80 odpovedá existujúcim `nginx/1.26.0 (Ubuntu)` a 500 namiesto Caddy 308; HTTPS kontroly pred tým prešli. Cudzia služba sa nezastavovala |
| Lokálne DNS | CoreDNS `1.14.7` natívne na Windows: priame dotazy na loopback vracajú `127.0.0.1`, na LAN rozhraní LAN IP; rovnaký hostname/origin/RP ID. Pôvodný DNS kontajner odpovedal interne, Windows forwarding nefungoval, preto bol zastavený |
| Cielené nastavenie Windows | `Enable-LanAcceptance.ps1`: syntax/WhatIf skontrolované, následné správcovské vykonanie PASS. Pravidlá Windows aj Hyper-V iba pre lokálnu LAN IP a klientsku podsieť, TCP 443 a TCP/UDP 53; exact NRPT hostname na lokálny DNS; import verejnej CA po SHA256 kontrole. Predvolená firewall politika zostala zachovaná |
| Telefón → LAN | ADB read-only ping a TCP 443 connect PASS. Po Wi-Fi DNS a zmene pevného Súkromného DNS na Automatický používateľ potvrdil načítanie kanonického HTTPS s TLS upozornením; DNS dosiahnuteľnosť PASS, dôvera CA zatiaľ čaká na import |
| Verifier build | Po prerušení zostal úspešne vytvorený image `bio-attestation-check` z 19. októbra 2026 08:57:06 UTC; Dockerfile má povinný `gradle test installDist`. Finálny stdout/aktuálny počet testov sa nezachoval, preto sa historických 8 testov neprenáša ako aktuálny spočítaný výsledok |
| `node tests/attestation-smoke.mjs` | PASS v novom behu po obnovení práce; health, interná autorizácia a fail-closed neplatné enrollment/trust evidence; jednorazový kontajner na náhodnom loopback porte bol zastavený. Žiadna úspešná fyzická atestácia ani zapnutie C |

YubiKey bol skutočne rozpoznaný cez USB/SmartCard: **Yubico Security Key C NFC**, firmware **5.8.0**, USB-C, FIDO2 podporované a zapnuté. Priamy `ykman fido info` sa bezpečne zastavil, pretože Windows vyžaduje administrátora; PIN sa nezadával, počet pokusov sa nemenil a token sa neresetoval. Modelové zistenie samo nepotvrdzuje UV ani registračnú atestáciu.

Trust vstupy boli overené nezávisle od registračnej požiadavky: [oficiálna Yubico tabuľka](https://support.yubico.com/s/article/YubiKey-hardware-FIDO2-AAGUIDs) priraďuje Security Key NFC USB-A/USB-C, firmware 5.8, AAGUID `0f083f18-4105-43a8-ad69-24e812e38141`. [Yubico root pre 5.7.4+](https://developers.yubico.com/U2F/Attestation_and_Metadata/) je [Yubico Attestation Root 1](https://developers.yubico.com/PKI/yubico-ca-1.pem), DER SHA256 `62760C6A6EF91679F454C8902B80FD009825B3F25DA90F1FBACE2EC6586CD5A8`. Oficiálny [FIDO MDS](https://mds.fidoalliance.org/) č. 291, `nextUpdate=2026-11-01`, bol kryptograficky overený vrátane reťazca/online revokácie; cieľový záznam má firmware `0x050800`, FIDO_CERTIFIED_L2/FIDO_CERTIFIED a identický root, bez compromise/revoked statusu. Verejné podklady a opakovateľný skript sú lokálne v ignorovanom `infra/data/yubico-reference/`.

Pripojený telefón: **Xiaomi 2406APNFAG**, Android **16 / API 36**, ADB autorizované používateľom, verified boot `green`, bootloader hlási `locked=1`. Toto nie je serverová hardvérová atestácia. Pred inštaláciou neexistoval projektový release ani debug package, preto nešlo o aktualizáciu spárovanej aplikácie. Prvý `adb install -r` skončil **FAIL `INSTALL_FAILED_USER_RESTRICTED`**; žiadna odinštalácia ani obchádzanie OS. Overený APK a verejná CA boli prenesené do Download na ručnú inštaláciu/import používateľom.

Používateľ následne oznámil, že súbory v telefóne nevidí. Cielené `adb shell ls` potvrdilo iba naše dva súbory `/sdcard/Download/bio-token-debug.apk` (33 117 810 bajtov) a `/sdcard/Download/bio-token-root.crt` (627 bajtov). Následný package check ešte nepreukázal inštaláciu. Spustený bol bežný systémový APK installer cez `ACTION_VIEW` na konkrétny lokálny súbor a obnova indexu iba týchto dvoch súborov; inštalačný súhlas zostal používateľovi. Prijatie intentu nie je dôkaz úspešnej inštalácie.

Používateľ oznámil „nainštalované na telefóne“, ale následné dva cielené dotazy na `sk.biotoken` v aktívnom profile 0 ani launcher resolve zatiaľ aplikáciu nenašli. Inštalácia sa preto neoznačuje ako PASS; čaká sa na rozlíšenie aplikácie od importu certifikátu alebo nedokončeného inštalátora. Žiadny opakovaný nútený install ani odinštalácia neprebehli.

Po upresnení používateľa, že inštalátor hlási úspech, ale ikonu nevidí, zlyhalo aj priame otvorenie manifestovej MainActivity (`Activity ... does not exist`). Cielený package dotaz cez všetky profily nenašiel náš namespace; ADB shell je štandardné UID 2000. Jeden nový `adb install -r` po tejto zmene hláseného stavu opäť skončil `INSTALL_FAILED_USER_RESTRICTED: Install canceled by user`. Ďalšie inštalačné pokusy sa zastavili. Skutočná inštalácia zostáva **NEOVERENÁ**, USB inštalácia **FAIL**; fyzické C sa nespúšťa. Táto prekážka nebráni začať B na PC.

Verejná identita zostaveného APK: `sk.biotoken.android.debug`, versionCode `1`, versionName `0.1.0`, min API 30 / target 35, origin `https://auth.bio-token.test`. **Podpisový certifikát SHA256** `c2b7995d1b4b0f763400bd56d82389156a76a3deeee7a828eeb1959b708475c7`. **APK súbor SHA256** `31204c5359cfdfa2e064695dda4abe3b41db24188eb64654f75e2b3477557c3e`. Tieto dva odtlačky majú odlišný význam; verifier musí kontrolovať signer skutočne nainštalovanej aplikácie. Súkromný signing kľúč sa neprenášal ani nezaznamenával.

| Fyzický scenár | Stav tohto pracoviska |
| --- | --- |
| B registrácia s fyzickým YubiKey | PASS po oprave issuer poolu; predchádzajúce pokusy FAIL zostávajú opísané nižšie. Server uložil `attestationVerified=true`, správny modelový AAGUID |
| B potvrdenie kandidáta | PASS po oprave; používateľ potvrdil aktívny kľúč a server eviduje profil B, stav ACTIVE, `proofAt=2026-10-19T09:54:43.865Z` |
| B heslo + YubiKey, UP/UV | PASS; používateľ sa fyzicky prihlásil, serverová session mala režim B a faktory password + webauthn, `authTime=2026-10-19T09:56:26.740Z` |
| B nesprávne heslo | PASS; používateľ potvrdil odmietnutie a neprihlásený stav |
| B chýbajúci token a zrušenie systémového dialógu | PASS pre kombinovaný scenár; používateľ potvrdil odmietnutie a neprihlásený stav, následný read-only počet platných sessions bol 0 |
| B nesprávny PIN | NEVYKONANÉ; PIN sa nehádal, lockout sa nevyvolával |
| B replay, expirácia a súbeh fyzického toku | NEVYKONANÉ; automatické testy vyššie ich nenahrádzajú |
| Android skutočný odtlačok/CryptoObject, cancel/lockout bez PIN fallbacku | NEVYKONANÉ |
| Android inštalácia a verejná identita APK | PASS po ručnom dokončení používateľom; package `sk.biotoken.android.debug`, MainActivity spustená, hash nainštalovaného base.apk zhodný s overenou zostavou |
| Atestácia oboch mobilných kľúčov cez skutočný verifier | NEVYKONANÉ |
| C credential, pairing/porovnávací kód, C trial a prihlásenie | NEVYKONANÉ |
| C staré QR, zámene účtu/transakcie, replay/expirácia/súbeh, revokácia | NEVYKONANÉ |
| C-only politika a odmietnutie slabších režimov; zmena biometrie/reinštalácia | NEVYKONANÉ |

Po fyzickom neúspechu bolo B znovu vypnuté (`WEBAUTHN_ENABLED=false`). C zostáva vypnuté: `MODE_C_ENABLED=false`, `MODE_C_HARDWARE_VERIFIED=false`. B možno dočasne obnoviť iba na ďalší konkrétny diagnostický pokus v izolovanej akceptačnej inštancii; nejde o prevádzkové schválenie. C sa nezapne pred splnením hardvérovej brány a úspešným B. Tajomstvá, QR, capability, PIN, heslá ani biometrické dáta nie sú súčasťou tohto záznamu.

Metadáta prvého fyzického zlyhania: dve B transakcie `REGISTER/PENDING_REGISTRATION`, každá s `attempts=1`, žiadny credential. Vytvorené 09:32:44 a 09:33:22 UTC, s 120-sekundovou expiráciou; A `authTime=09:32:25 UTC`. Obe požiadavky prešli serverovým rezervovaním pokusu pri čerstvom prihlásení. To zužuje príčinu na validačnú hranicu, AAGUID gate alebo následnú transakčnú kontrolu; generická chyba sama neurčuje presný dôvod. PIN sa nezisťoval ani neskúšal agentom. Nezávislá úzka skúška SimpleWebAuthn 14.0.3 s verejnými overenými Yubico MDS reťazcami A1/B2 a Root 1 prešla; všeobecná nepodpora nového rootu/algoritmov sa nepotvrdila. Ďalší fyzický pokus čaká na bezpečnú klasifikovanú serverovú diagnostiku, bez raw chýb alebo registračných údajov.

Následná úzka oprava doplnila serverovú klasifikáciu registračného odmietnutia (`webauthn.registration_rejected`): iba pevný event, runtime allowlist kód a voliteľný počet certifikátov 0–5 pri chybe reťazca. Logger nedostáva výnimku, message/stack, request, challenge, certifikát, credential ani PIN. Klientská generická chyba a všetky validačné/časové brány zostali zachované. `pnpm check`, API TypeScript build a tri nové standalone regresné testy prešli; následný kompletný izolovaný Compose beh prešiel **50/50, 0 skipped**. Nezávislá bezpečnostná kontrola diffu nemala blokujúcu výhradu. Tieto kontroly potvrdzujú diagnostiku a zachované odmietanie, nie úspešnú fyzickú registráciu. B sa obnovuje iba na jeden konkrétny diagnostický pokus, C zostáva vypnuté.

Druhý fyzický pokus po nasadení diagnostiky opäť skončil generickou chybou. Bezpečne extrahovaný serverový výsledok: **`certificate_path`, `x5cCount=1`**. Je teda potvrdené zlyhanie dôveryhodnej cesty pri jednom dodanom certifikáte, nie konkrétny klientsky issuer ani úspešná atestácia. B sa opäť vyplo. Použitá knižnica nemá samostatný intermediate pool parameter a sama nedohľadáva chýbajúcich issuerov. Pripravuje sa explicitný serverový issuer pool, oddelený od root trustu, so zachovaním pôvodného podpisovaného payloadu a následnej plnej knižničnej validácie.

Verejný pomocný pool obsahuje päť non-root CA z overeného MDS č. 291 aj [oficiálneho Yubico intermediate bundle](https://developers.yubico.com/PKI/yubico-intermediate.pem). Všetkých päť podpisových ciest prešlo OpenSSL proti jedinému nezávisle overenému Yubico Root 1; helper CA boli dodané ako untrusted issuers. Pool SHA256 `7B7AF52C7B7393536DA23FC93930B8DA0F25C938E4EA3CFA4CB51C38492B9536`; manifest s DER odtlačkami/platnosťou je lokálne v ignorovanom `infra/data/yubico-reference/`. CA nemajú CDP/AIA, preto sa netvrdí samostatný per-CA CRL výsledok; aktuálny overený MDS neobsahoval compromise/revoked report. Konfiguračný súbor `webauthn-intermediates.json` ostáva oddelený od nezmeneného `webauthn-roots.json`. Fyzický výsledok po doplnení zatiaľ **NEVYKONANÉ**.

Implementácia issuer poolu dokončená: voliteľný `WEBAUTHN_INTERMEDIATES_FILE`, kryptografické X509 issuer lookup, bounded doplnenie iba `attStmt.x5c` bez mutácie pôvodnej registračnej odpovede alebo podpísaných bajtov; finálny SimpleWebAuthn verifier zostáva povinný. Root store ostáva oddelený. `pnpm check`, API TypeScript a 6/6 standalone diagnostických/packed testov prešli; následný kompletný Compose beh **53/53, 0 skipped**. Skutočne podpísaná dočasná packed fixture s root → upper CA → issuer CA → leaf potvrdila root-only odmietnutie a úspešné overenie po doplnení dvoch issuerov. Negatívne root/issuer/podpis/payload/UP/UV/none/self/duplicate/ambiguity/expiry/size prípady zostali odmietnuté. Nezávislé bezpečnostné review PASS. B sa obnovuje iba na fyzickú akceptáciu opravy; C zostáva vypnuté a fyzické B sa ešte neoznačuje PASS.

Nasadenie opravy na izolovanej inštancii prešlo: API healthy, modul issuer poolu prítomný, root count **1**, pool count **5**. Kanonické HTTPS `/api/auth/capabilities` overené nezávislým Node klientom s plnou CA/hostname validáciou: HTTP 200, režimy A/B, C false. Používateľ bol navedný na nové čerstvé A prihlásenie, B registráciu a samostatné potvrdenie kandidáta. Fyzický výsledok tohto pokusu sa ešte čaká; minulé chyby sa nemenia na PASS iba nasadením opravy.

Následný **fyzický pokus po oprave PASS pre registráciu a aktiváciu B**: používateľ oznámil „Kľúč pre B je aktívny“. Nezávislé read-only metadáta servera potvrdili profil B, stav ACTIVE, skutočne overenú atestáciu, AAGUID `0f083f18-4105-43a8-ad69-24e812e38141` a úspešný následný proof o 09:54:43.865 UTC. Politika testovacieho účtu už obsahuje A aj B; nebola menená priamym DB zápisom. Tým sa potvrdila fyzická registračná atestácia a kandidátska assertion cez pôvodné UP/UV kontroly. Úplné B prihlásenie a negatívne fyzické prípady sa vyhodnocujú samostatne; C zostáva vypnuté.

**Aktuálny fyzický výsledok B:** používateľ následne potvrdil úspešné prihlásenie heslom a YubiKey. Serverová session mala `mode=B`, `factors=[password, webauthn]`, `authTime=2026-10-19T09:56:26.740Z`. Po odhlásení používateľ vykonal nesprávne heslo a samostatný pokus so správnym heslom bez pripojeného tokenu, ukončený zrušením systémového dialógu. Obe skúšky boli odmietnuté; používateľ zostal odhlásený a read-only SQL následne vrátil 0 neexpirovaných sessions. Kombinovaný missing-token/cancel scenár nepreukazuje samostatne expiráciu. Nesprávny PIN, replay, expirácia a súbeh fyzického toku zostávajú nevykonané. B je teraz zapnuté iba na tejto izolovanej akceptačnej inštancii; predchádzajúce vypínania vyššie zachytávajú diagnostickú históriu. C zostáva vypnuté.

Po dokončení týchto B skúšok jeden nový cielený Android package dotaz aplikáciu stále nenašiel. Overený systémový DocumentsUI handler prijal otvorenie presného adresára `Download` cez jeho content URI, aby používateľ vybral `bio-token-debug.apk` v bežnom správcovi súborov. Žiadny ďalší USB install retry ani zmena bezpečnostných nastavení neprebehli. Čaká sa na skutočné dokončenie inštalácie; samotný intent sa neoznačuje ako úspešná inštalácia.

Používateľ potom výslovne uviedol otvorenie APK a hlásenie dokončenej inštalácie bez ikony. Jediná následná kontrola stále nenašla projektový package ani s `pm list packages -u`; aktívny používateľ je 0 a launcher resolver vrátil `No activity found`. Tento rozpor zatiaľ zostáva nevysvetlený. Ďalší install sa neopakoval; čaká sa na názov a tlačidlá poslednej obrazovky z telefónu.

Následné presné prepísanie obrazovky používateľom rozpor vysvetlilo: názov **Bio Token**, text **„Aplikácia nebola nainštalovaná“**, tlačidlo **Hotovo**. Ručná inštalácia je teda FAIL, nie úspešná inštalácia s chýbajúcou ikonou. Dva cielené read-only logcat filtre iba pre vlastný package/názov APK nenašli dostupný inštalačný kód; nevypisovali sa surové logy. Ďalším krokom je používateľova kontrola štandardného oprávnenia „Inštalovať neznáme aplikácie“ iba pre konkrétne Súbory podľa oficiálneho Xiaomi návodu; ak už je povolené, bez ďalšieho opakovania inštalácie. Play Protect ani globálne ochrany sa nemenia.

**Aktuálny výsledok inštalácie Android PASS:** používateľ oznámil, že inštaláciu už dokončil. Nový cielený package dotaz našiel `sk.biotoken.android.debug` a explicitné spustenie manifestovej MainActivity bolo prijaté. Read-only stiahnutie nainštalovaného `base.apk` poskytlo SHA256 `31204c5359cfdfa2e064695dda4abe3b41db24188eb64654f75e2b3477557c3e`, presne zhodný s predtým overeným APK vrátane jeho podpisu. Predchádzajúce odmietnutia zostávajú históriou; chýbajúci package už nie je aktuálna prekážka. Konkrétny používateľov krok, ktorý inštaláciu dokončil, nebol určený, preto sa príčina nepripisuje konkrétnemu nastaveniu OS. Nasleduje overenie kanonického HTTPS na telefóne.

Nezávislé Android/bezpečnostné posúdenie odhalilo medzeru v pre-C akceptácii: existujúci `DeviceKeysTest` preukazuje per-use autentifikačnú politiku a odmietnutie neautorizovaného podpisu, ale nevyvolá úspešný CryptoObject prompt ani zrušenie používateľom. Produkčné UI sa k promptu dostane až po serverovom C párovaní. Pripravuje sa preto výslovne spúšťaný lokálny interaktívny instrumentation test bez siete, účtu, session alebo zmeny C gate, s dočasnými kľúčmi a lokálnym overením podpisu. Kým neprebehne, odtlačok zostáva NEVYKONANÉ. Verifier `/health` sám nekontroluje dostupnosť živých revokácií ani úspešnú atestáciu; tieto výsledky sa nesmú odvodiť zo štartu kontajnera.

Po potvrdení nainštalovaného APK boli v lokálnej konfigurácii nastavené jeho verejné údaje: debug package, vyššie uvedený SHA256 signera a minimum versionCode 1. Interné tajomstvo sa zachovalo bez výpisu. `docker compose --profile mode-c build attestation` prešiel z cache (nejde o nové spočítané spustenie JVM testov) a spustil sa iba interný verifier. Bezprostredný prvý health pokus bol počas štartu nedostupný; následný cielený pokus z API vrátil HTTP 200. Docker potvrdil `8081/tcp: null`, teda bez publikovaného portu. Runtime API stále hlási oba C gate flagy `false`. Telefónový browser zatiaľ hlásil nedostupnú adresu; používateľ nastavuje Wi-Fi DNS na lokálny server. Úspešná TLS dôvera telefónu, CRL ani atestácia sa zatiaľ netvrdia.

Používateľ uložil Wi-Fi DNS `192.168.68.108`, ale názov ešte nefungoval. Read-only kontrola identifikovala `private_dns_mode=hostname`; po používateľovom prepnutí na Automatický sa kanonická HTTPS stránka otvorila s upozornením na certifikát. DNS prekážka je tým odstránená. Import verejnej CA ešte čaká na potvrdenie; používateľ dostal verejný DER SHA256 vyššie a postup CA importu, bez obchádzania TLS. Žiadna aplikácia tretej strany, úprava hosts, root ani vypnutie TLS validácie sa nepoužili.

Následný read-only ping z telefónu potvrdil preklad presne na `192.168.68.108` a úspešnú odpoveď. Používateľ hlásil dokončenie importu CA, zároveň nepresné hlásenie o chýbajúcom HTTPS. Znova sa otvoril presný kanonický `https://` origin a čaká sa na presný text/kód chyby; bez neho sa TLS dôvera ešte neoznačuje PASS.

Nový offline interaktívny test má samostatný test-only runner s obyčajným `Application`, aby vôbec nespúšťal produkčný `DeviceStore/removeOrphaned`. Bezpečnostné review konkrétneho kódu PASS. Prvá kontrola zostaveného manifestu zachytila prepísanie custom runnera AGP; po jedinej oprave manifestu druhý build prešiel a packaged manifest obsahuje štandardný aj offline runner so správnym debug target package. Kotlin compile, `assembleDebugAndroidTest`, `lintDebug` a `spotlessCheck` PASS. Fyzický biometrický beh zostáva NEVYKONANÉ; zostavenie ani review ho nenahrádzajú.

Finálny test APK: package `sk.biotoken.android.debug.test`, file SHA256 `1f56ce527cc1fcd9fd1d6e6bd218f5a327457849d9300435a5961423b6e03da3`, rovnaký overený debug signer ako hlavný APK; `apksigner verify` PASS. Finálny lint má 0 chýb/40 upozornení. Hlavný APK zostal bajtovo nezmenený a dočasný SUBST alias bol odstránený. Test APK sa preniesol do `/sdcard/Download/bio-token-device-test.apk`, vzdialený SHA256 zhodný. Zatiaľ sa neinštaloval ani nespustil; telefón zostal na kroku overenia HTTPS. Následný opt-in beh a jeho hranice sú v Android README. C stále vypnuté.

Poznámka k diagnostike: `/api/health` v aktuálnom kóde vracia statické `modes: [A]`; skutočne dostupné režimy hlási `/api/auth/capabilities` (overené `[A, B]`, `webauthnEnabled=true`, `modeCEnabled=false`). Health sa nepoužíva ako dôkaz fyzickej pripravenosti ani stavu verifiera.

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
