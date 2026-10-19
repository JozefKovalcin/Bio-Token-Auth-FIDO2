# Implementačný plán režimov B a C

Návrh z 19. októbra 2026 pre východiskový commit `91e1396`. Tento dokument zachováva pôvodný plán a východiská. Následnú implementáciu a jej hranice opisujú [návod B/C](modes-b-c.md) a [záznam overenia](verification.md); plán sám nie je dôkazom úspešných testov či nasadenia. Vznikol spoločnou analýzou koordinátora a troch špecializovaných agentov: backend/WebAuthn, Android a nezávislé bezpečnostné overenie.

## Odporúčanie a rozsah

Navrhnúť B aj C spolu, ale dodávať ich postupne. Najprv spoločná politika, relácie a WebAuthn, potom funkčný režim B. Android overiť malým experimentom na fyzickom telefóne ešte pred úplnou implementáciou C. Hotový B bude samostatný míľnik; C zostane vypnutý, kým neprejde celým overením.

- A zachová aktuálne správanie: heslo, po aktivácii aj TOTP. Predmetom tohto plánu nie je nenápadná zmena jeho pravidiel.
- B: heslo a WebAuthn credential pre režim B na podporovanom YubiKey.
- C: discoverable WebAuthn credential s UP/UV a následný biometricky autorizovaný podpis spárovaného Android zariadenia toho istého účtu v tej istej transakcii. Webovú reláciu dostáva iba pôvodný prehliadač.
- Backend určuje povolené režimy a predpoklady ich použitia. Ak účet vyžaduje C, A ani B nemôžu vytvoriť použiteľnú prihlasovaciu reláciu.
- A/B/C sú serverom povolené alternatívy, nie automatická hierarchia oprávnení. Aktívne TOTP v A samo nepridáva tretí faktor do B; B zostáva heslo + YubiKey. Správa faktorov má vlastné pravidlá čerstvého overenia.
- Použiť SimpleWebAuthn, Android Keystore/AndroidX Biometric, JOSE a existujúce validačné knižnice. Nevytvárať vlastnú kryptografiu, CTAP klienta ani vlastný formát podpisov.
- Obnova a odvolanie faktorov patria do návrhu od začiatku. Kompletný samoobslužný recovery portál môže byť ďalšia etapa; do jeho dokončenia musí byť presne zdokumentovaný kontrolovaný postup bez fallbacku na slabší režim.

## Východiská z aktuálneho kódu

`apps/api/src/auth.service.ts` dnes obsluhuje iba A. `Session` eviduje token, účet a expiráciu; neeviduje, akými faktormi vznikla. `totpActive` vo výstupe `/me` opisuje nastavenie účtu, nie preukázané faktory konkrétnej relácie. Existujúce relácie sa po aktivácii TOTP automaticky nestanú dôkazom jeho splnenia.

`Pending` je rozpracované overenie TOTP. Nové účely nesmú prijímať jeho token ako univerzálne oprávnenie. `app.ts` vyžaduje na všetkých POST browserový Origin a používa globálny 8 KiB JSON limit. Native Android endpointy potrebujú samostatnú autorizáciu a obmedzené veľkosti atestačných vstupov. Globálnu ochranu webu nemožno pri ich zavádzaní vypnúť.

Súčasný LAN postup používa HTTPS na IP adrese. Pre WebAuthn treba stabilný DNS hostname a samostatnú konfiguráciu RP ID. Pred registráciou kľúčov treba vybrať konečný lokálny DNS názov dostupný z PC aj telefónu. Android má iba README; Gradle build, wrapper a testovacie tasky treba ešte vytvoriť.

## Cieľové lokálne nasadenie

Použiť existujúci Docker Compose: Caddy poskytuje React web a HTTPS a smeruje `/api/*` na NestJS API; PostgreSQL beží v samostatnom kontajneri. Serverom je vlastný počítač v lokálnej sieti. Plán nevyžaduje platený cloudový hosting ani cloudový billing účet; počítač musí byť počas používania zapnutý a dostupný klientom.

- **Adresa a TLS:** vybrať stabilný lokálny DNS názov dostupný z PC aj telefónu. Interný DNS môže poskytovať router alebo lokálny DNS server; kúpa verejnej domény nie je podmienkou LAN dema. Nastaviť Caddy certifikát pre tento názov, presný `APP_ORIGIN` a `WEBAUTHN_RP_ID`. Verejný koreňový certifikát lokálnej CA bezpečne pridať medzi dôveryhodné na klientoch; súkromný CA kľúč zostáva na serveri.
- **Cookies a izolácia:** zachovať samostatné `__Host-bio_session` a `__Host-bio_pending` s `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/` a bez `Domain`. Nevytvárať zjednotený browser context len kvôli hostingu. Nový login dostane čerstvý serverom vytvorený pending token a zruší predchádzajúce pending oprávnenie; dokončenie vytvorí novú session. Aktuálna session a nový pending login nesmú zamieňať účty ani faktorové dôkazy.
- **Sieť a dáta:** API ani DB port nepublikovať priamo. Prehliadač používa rovnaký origin pre web a API. Zachovať kontrolu `Origin`, bezpečnostné hlavičky Caddy/API a `Cache-Control: no-store` na autentifikačných odpovediach. Tajomstvá zostávajú v ignorovanej lokálnej konfigurácii; DB, šifrovací kľúč TOTP a CA vyžadujú riadené zálohy.
- **Android:** aplikácia komunikuje s tým istým dôveryhodným lokálnym hostname. LAN CA potrebuje explicitný úzko obmedzený Network Security Config. Testovacie podpísané APK sa zostaví lokálne a nainštaluje na testovací telefón; cloudová distribučná služba nie je súčasťou plánu.
- **Overenie:** najprv potvrdiť regresiu A cez Caddy/HTTPS a lokálny DNS na PC aj telefóne. Potom registrovať B/C credentialy na zvolenom RP ID. Testovať fixáciu a izoláciu pending tokenov dvoma prehliadačmi: držiteľ starého tokenu nesmie pollovať ani dokončiť novo začatý flow.

Verejné internetové nasadenie nie je súčasťou tejto etapy. Prípadné neskoršie rozšírenie sa navrhne osobitne; zmena RP ID môže vyžadovať nové registrácie credentialov.

## Vlastníctvo práce a používanie agentov

| Rola | Zodpovednosť | Povinné podklady |
| --- | --- | --- |
| Koordinátor/architekt | ADR, kontrakt, závislosti, integrácia, schválené bezpečnostné invarianty | AGENTS.md, docs/skills.md, architektúra a hrozby |
| Backend/WebAuthn agent | NestJS moduly, schéma, migrácie, WebAuthn, relácie, párovanie, dokončenie C | nestjs-best-practices, prisma-orm-setup podľa zásahu, supabase-postgres-best-practices a relevantné pravidlá |
| Web agent | Obrazovky B/C, správa faktorov, explicitný stav, polling, prístupnosť | vercel-react-best-practices a relevantné pravidlá |
| Android agent | Reálny build, Kotlin kontrakt, Keystore, biometria, QR, TLS, Compose | .agents/README.md, projektové referencie, deliver-android-feature, compose-state-holder-ui-split, kotlin-flow-state-event-modeling, verify-android-change; add-android-module s rešpektovaním chýbajúcej upstream infraštruktúry |
| Nezávislý bezpečnostný/testovací agent | Adverzárne testy, review dôkazov faktorov, race conditions, recovery a release brány | AGENTS.md, threat-model, testing, relevantné backend/Android pravidlá |

Pri štyroch dostupných agentoch pracuje koordinátor a tri odborné roly. Web rola sa obsadí po uzavretí backendového kontraktu uvoľneným agentom; nejde o požiadavku na päť súbežných procesov.

Každé zadanie musí obsahovať rozsah súborov, prijatý kontrakt, invarianty, kritériá dokončenia a požadované dôkazy. Schému a OpenAPI v jednej etape upravuje jeden vlastník. Web a Android používajú až odsúhlasenú verziu kontraktu; návrhy zmien vracajú vlastníkovi. Autor bezpečnostne citlivého kódu nie je jeho jediným reviewerom. Externé skilly nesmú meniť politiku projektu. Testy vznikajú v tej istej etape ako správanie, ktoré overujú.

## Etapa 0: rozhodnutia a fyzická kompatibilita

**Výstup:** ADR pre hostname/RP ID, autentifikačnú politiku, akceptované autentifikátory, mobilné podpisy a dôveru zariadeniu; prvá verzia rozšírenia OpenAPI.

1. Vybrať stabilný lokálny DNS názov dostupný z PC aj telefónu. Nastaviť DNS, Caddy, dôveru lokálnej CA, `APP_ORIGIN` a validované `WEBAUTHN_RP_ID`. Hostname nesmie byť ľubovoľná hodnota odvodená z HTTP Host. RP ID nemá schému ani port. Zmena RP ID neskôr znamená nové registrácie credentialov.
2. Overiť prehliadač a fyzický YubiKey 5C NFC: registrácia, dotyk, UV/PIN, discoverable aj non-discoverable profil. Navrhovaný default B je UP aj UV; ADR ho potvrdí alebo výslovne zvolí UP s heslom bez povinného UV. Zvolený profil musí byť jednotný v options, serverovom overení a negatívnych testoch. C vyžaduje UP aj UV bez výnimky.
3. Presne pomenovať garanciu YubiKey. Ak systém pripúšťa iba podporované YubiKey, vyžadovať a validovať dôveryhodnú atestáciu s metadátami a politikou akceptovaných modelov. Samotný AAGUID, názov, USB hint, `authenticatorAttachment` ani úspešné overenie podpisu nepreukazujú výrobcu. Vybrať aktuálnu opravenú verziu knižníc a overiť konfiguráciu trust anchors. USB transport je požadovaný postup dema; webové hinty nie sú kryptografický dôkaz fyzického transportu.
4. Pre B žiadať `residentKey: discouraged`; je to preferencia API, nie univerzálna serverová záruka neobjaviteľnosti. Schopnosť profilu overiť na podporovanom YubiKey. C žiada `residentKey: required`. Základný plán používa samostatné credentialy B/C; existujúci B credential sa automaticky nepovýši na C.
5. Na vybranom telefóne overiť auth-per-use Keystore podpis, zrušenie biometrie, odmietnutie PIN fallbacku, atestáciu a verifikáciu podpisu v Node. Navrhované minimum je Android API 30; finálny profil určí tento experiment a dostupný telefón.
6. Určiť úroveň dôvery v mobilný kľúč. Pre tvrdenie, že server vynucuje biometrickú ochranu kľúča, treba validovať príslušnú atestáciu a vynútené autorizačné parametre. Nepodporované zariadenie nevyriešiť tichým prijatím obyčajného softvérového kľúča. Demo bez overenej atestácie musí mať výslovne obmedzené tvrdenia a nesmie byť vydávané za úplne overený C.

**Brána:** funkčná DNS/TLS cesta a doložená kompatibilita zariadení; neschválená alebo nepodporovaná konfigurácia C zostáva vypnutá. Samotné plánovanie nevyžaduje prístup k fyzickým zariadeniam; ich výsledky sú podmienkou implementačného míľnika.

## Etapa 1: spoločná politika, relácie a transakcie

**Výstup:** základ pripravený na B/C pri zachovaní regresných testov A.

- Oddeliť zodpovednosti v NestJS: politika/relácie, WebAuthn a mobilné zariadenia; injektovať závislosti konštruktorom. Existujúci AuthService nerozširovať na jeden servis pre všetko.
- Zachovať serverové opaque session cookies; B/C nevyžadujú migráciu na JWT. Zachovať aj existujúci node:test/PostgreSQL štýl integračných testov, pokiaľ konkrétna potreba neodôvodní zmenu.
- Pridať centrálne rozhodovanie o režimoch, verziu politiky účtu a kontrolu predpokladov aktivácie. `allowedModes` nemá znamenať automatické zníženie požadovaných faktorov pri chybe.
- Relácia bude mať režim, serverom overené faktorové dôkazy, čas ich splnenia, použitý credential/device a verziu bezpečnostného stavu účtu. Údaje nepreberať z klientovho tvrdenia. Existujúce relácie pri bezpečnostnej migrácii odvolať; nepripisovať im spätne splnené faktory.
- Zaviesť čerstvé opätovné overenie pre správu faktorov a zmenu politiky. Osemhodinová cookie sama osebe nestačí. Ak je TOTP aktívne, password-only relácia nemôže spravovať silné faktory. Čerstvosť a konkrétne požadované dôkazy určí centrálna politika operácie.
- Účelovo oddeliť login, registráciu credentialu, pairing, zmenu politiky a odvolanie. Každý challenge má náhodnú hodnotu, účel, mód, účet, väzbu na iniciujúcu reláciu/PC, expiráciu a stav spotreby. Pri C je účet pred WebAuthn neznámy a po overení sa priradí iba raz.
- Pre C použiť explicitný stavový automat; rovnaký spoločný mechanizmus môže obslúžiť B, bez nutnosti prepisovať A na veľký univerzálny framework. Jedna aktívna login transakcia na cookie jar je prijateľné prvé obmedzenie; nový pokus starý zruší a UI to jasne spracuje.
- Databázové migrácie iba aditívne do okamihu riadeného prechodu. Pridať unikátne credential ID, cudzie kľúče, indexy účtu/expirácie a obmedzenia stavov. Nemeniť major verziu Prisma iba kvôli B/C.
- Kontroly podpisov robiť mimo dlho držaných zámkov; v krátkej dokončovacej transakcii znovu overiť stav, verziu, expiráciu, politiku a aktívnosť faktorov. Konzistentné poradie zámkov alebo podmienené aktualizácie musia riešiť aj odvolanie počas dokončenia.
- Verifikácia vychádza z konkrétneho counter/version credentialu. Commit ich pod zámkom alebo CAS znovu porovná; pri zmene overenie zopakuje alebo bezpečne reštartuje. Nikdy neprepíše novší counter starším. Aktualizácia credentialu, spotreba challenge a vydanie session sú atomické; testovať súbežné assertions rovnakého credentialu z rozdielnych transakcií.
- Zachovať oddelené session a pending cookies a rozšíriť testy o účelové oprávnenia, čerstvý pending token pri novom flow a izoláciu medzi prehliadačmi. Pred B doložiť regresiu A cez lokálny DNS a HTTPS.

Navrhované dátové celky: `WebAuthnCredential`, účelová `AuthTransaction`/challenge, rozšírená `Session`, `MobileDevice`, `PairingRequest` a bezpečnostný audit bez tajomstiev. Credential uloží verejný kľúč, účet, profil B/C, RP ID, counter, relevantné backup flags/metadáta a stav odvolania. Mobil uloží verejný kľúč, overenú úroveň dôvery, verziu a stav; privátny kľúč neopustí zariadenie. Krátkodobé capability tokeny ukladať hashované. Schéma rozlišuje identifikátor transakcie od tajomstva, ktoré oprávňuje konať. Unikátna väzba session na zdrojovú login transakciu je ďalšia obrana pred dvojitým vydaním.

**Brána:** všetky testy A prejdú; stará relácia, zmenená politika ani token iného účelu nevytvoria oprávnenie pre B/C. Migračný a návratový postup sú zdokumentované; návrat verzie nesmie znovu povoliť slabšie prihlásenie.

## Etapa 2: registrácia kľúča a hotový režim B

**Výstup:** úplný vertikálny tok registrácie a prihlásenia B vrátane webu a testov.

1. Registrácia v čerstvo overenej relácii vytvorí jednorazové WebAuthn options viazané na účet, účel a profil B. Overiť challenge, origin, RP ID, typ operácie, verejný kľúč, UP/UV a dohodnutú atestačnú politiku. Uloženie credentialu a spotreba registrácie musia byť atomické. Duplicitu odmietnuť aj databázovým unikátnym obmedzením.
2. Prvý faktor B overí meno a heslo aj politiku účtu; vytvorí iba rozpracované B overenie. Nevydá plnú A session a TOTP endpoint ho nesmie dokončiť.
3. Options obsahujú iba aktívne B credentialy overeného účtu v `allowCredentials`. SimpleWebAuthn overí assertion; server kontroluje mapping na účet a požadovaný profil. Spracovať counter/backup flags podľa vlastností povolených autentifikátorov a knižnice; netváriť sa, že counter je univerzálny dôkaz neklonovateľnosti.
4. Atomicky spotrebovať challenge a transakciu, aktualizovať stav credentialu, odvolať nahrádzanú reláciu a vytvoriť novú reláciu s dôkazmi `password + WebAuthn B`. Podpis nesmie byť použiteľný na druhé dokončenie.
5. Web rozšíriť o explicitné stavy, volanie WebAuthn po používateľskej akcii, zrušenie, timeout, chýbajúci kľúč a nekompatibilný prehliadač. Moduly klienta načítať podľa potreby. Neponúkať automatický TOTP fallback, ak politika povoľuje iba B/C.
6. Pred prvým povolením B vykonať skúšobné úplné B overenie nového credentialu. Formálne úspešná registrácia sama nie je release dôkaz jeho použiteľnosti v prihlasovacom toku. Skúška je účelovo obmedzený dôkaz držby kandidáta, nie náhradná cesta na vydanie login session; bootstrap stále autorizuje aktuálna politika účtu.

Navrhované rodiny endpointov (finálne názvy určí OpenAPI): `webauthn/registrations/options|verify`, `auth/b/password`, `auth/b/webauthn/options|verify`, prehľad a odvolanie vlastných credentialov. Registračný profil aj účet musí autorizovať server; browser nemôže prepnúť B registráciu na C zmenou poľa.

**Brána:** automatické testy aj fyzické B s YubiKey; A zostáva funkčné iba tam, kde ho politika povoľuje. Zamietnutie alebo zrušenie WebAuthn nikdy nevytvorí session.

## Etapa 3: Android build a podpisová hranica

Môže prebiehať súbežne s etapou 2 po ustálení spoločného kontraktu; skorý fyzický experiment z etapy 0 má prednosť pred plnou UI implementáciou.

- Vytvoriť samostatný Gradle build v `apps/android` s wrapperom a verziami kompatibilnými s aktuálnym Android toolchainom. Začať malým `:app` a prípadne `:core` JVM modulom pre reálne nezávislú logiku. Nevytvárať generátor, Makefile ani rozsiahle convention plugins len preto, že ich predpokladá upstream skill.
- Kotlin DTO/HTTP klient odvodiť z OpenAPI alebo udržiavať so serializačnými kontraktovými testami. TypeScript typy nie sú kontrakt pre Android.
- Navrhnutý profil kľúča: neexportovateľný EC P-256 v AndroidKeyStore, autorizácia každého použitia iba silnou biometriou, `CryptoObject(Signature)`, zneplatnenie pri zmene biometrického zápisu. Silný biometrický prompt bez `DEVICE_CREDENTIAL`. StrongBox sa nesmie predpokladať na každom telefóne.
- Použiť štandardnú JWS obálku ES256 cez knižnice. Server určí protected header a presný payload; CryptoObject autorizuje podpis celého JWS Signing Input `base64url(protected).base64url(payload)`, nie iba JSON payloadu. JOSE integrácia musí podporiť tento externý biometricky autorizovaný podpis. Nespoliehať sa na zhodné poradie JSON polí. Payload obsahuje verziu, audience servera, účel, účet, transakciu, zariadenie, nepriehľadnú väzbu na PC, nonce a expiráciu. Nedávať doň cookie ani iné PC tajomstvo. Server porovná obsah s uloženým očakávaním a neprijme klientom nahradené údaje. Kotlin/Node fixtures overia aj knižničný prevod DER a JOSE kódovania ECDSA. Algoritmus a povolený typ kľúča určuje server.
- Origin a CA sa konfigurujú dôveryhodne; QR nesmie presmerovať podpisovanie na ľubovoľný server ani inštalovať dôveru. Pre vývojovú LAN CA použiť úzko obmedzený Network Security Config; release nepoužíva trust-all ani vypnutú kontrolu hostname.
- Oddeliť čisté Compose UI od state holderov a od platformových adaptérov kamery/Keystore/BiometricPrompt. Modelovať loading, kontrolu servera, detail transakcie, prompt, schvaľovanie, zamietnutie, expiráciu, lockout a zneplatnený kľúč. Rotácia ani obnovenie procesu nesmú automaticky znova podpísať alebo schváliť požiadavku.
- Osobitne riešiť autorizáciu native požiadaviek. Navrhovaný default pre čítanie chránených detailov a zamietnutie je oddelený spárovaný device-auth kľúč so serverovým jednorazovým request challenge a JWS dôkazom viazaným na operáciu, účet/zariadenie a presný request. Tento dôkaz nikdy nenahrádza biometrický approval kľúč. ADR musí pred implementáciou kontraktu určiť jeho životný cyklus a testy, prípadne výslovnú rovnocennú alternatívu. Autorizácia resolve/reject nie je voliteľná; QR samo osebe neoprávňuje čítať účet alebo schvaľovať.

**Brána:** reprodukovateľný Android build, Kotlin/Node kontraktové testy a fyzicky overený podpis bez PIN fallbacku. Emulátor ani fake biometria nepotvrdzujú hardvérové vlastnosti.

## Etapa 4: C credential a bezpečné párovanie

**Výstup:** účet môže pripraviť oba faktory C bez otvorenia obchádzky existujúcej politiky.

1. Po čerstvom oprávnenom overení zaregistrovať osobitný C discoverable credential s povinným UP/UV a overeným stabilným opaque user handle. Definovať náhodný handle pre konkrétny enrollment/credential s mapovaním N:1 na účet; opakované použitie rovnakého `(RP ID, userHandle)` na tom istom autentifikátore môže resident credential nahradiť. Pokryť opakovanú registráciu aj záložné fyzické kľúče. B credential tým nezíska oprávnenie C.
2. Prvé párovanie pri prechode z A/B má výslovný bootstrap postup: splniť aktuálnu politiku, čerstvo preukázať C YubiKey a až potom vytvoriť krátkodobú pairing požiadavku. Pridávanie zariadenia k už aktívnemu C účtu vyžaduje čerstvé C alebo osobitný kontrolovaný recovery proces.
3. QR je iba náhodná jednorazová capability pre konkrétny pairing, nikdy webová session. Telefón predloží verejné kľúče, serverom vyžiadanú atestáciu a biometrický dôkaz držby approval kľúča. Device-auth kľúč, ak sa používa, musí byť viazaný v tom istom overenom enrollmente. Zariadenie zatiaľ ostáva kandidátom.
4. Overiť atestačný challenge, chain až po dôveryhodný root, stav odvolania a požadované vlastnosti kľúča, aplikácie a zariadenia podľa prijatej politiky. Použiť udržiavanú validáciu, priebežne aktualizovať trust roots a metadáta. Nespoliehať sa na mobilné tvrdenie `isHardwareBacked`.
5. Pôvodné PC zobrazí konkrétny kandidátsky kľúč/zariadenie a vyžiada potvrdenie s porovnaním identifikátora medzi obrazovkami. Ukradnutie pairing QR ani pretečenie prvého kandidáta nesmie samo aktivovať cudzí telefón. Podobu potvrdenia a jeho väzbu zahrnúť do threat-model review.
6. Atomicky spotrebovať pairing a aktivovať zariadenie. Samotné zaregistrovanie faktorov nemá automaticky meniť povolené režimy. V tejto etape sa C-only politika ešte nezapína; úplný tok a jeho skúšobné overenie vzniknú v etape 5.

**Brána:** ukradnutý QR, zámena kandidáta, replay enrollmentu, iný účet a odvolané zariadenie sa odmietnu. Faktory sú pripravené, bežné prihlasovanie C zostáva vypnuté do etapy 5.

## Etapa 5: kompletné prihlásenie C

1. PC vytvorí C transakciu viazanú na svoju chránenú pending cookie, bez používateľského mena. WebAuthn použije discoverable C credential. Server overí assertion, `credentialId`/`userHandle`, UP/UV a politiku. Účet priradí podľa svojich záznamov, nie údajov z mobilu.
2. Prechod `PENDING_YUBIKEY -> PENDING_MOBILE` vytvorí nový mobilný challenge s predvolenou platnosťou 120 sekúnd. QR vydá až po úspešnom YubiKey; QR nie je oprávnenie na polling PC ani na prevzatie session.
3. Spárovaný telefón sa autorizuje na načítanie detailov, overí dôveryhodný server a zobrazí službu, účet, účel a transakciu. Používateľ musí výslovne schváliť; biometria autorizuje podpis presnej výzvy. Zamietnutie je autentifikovaný, účelovo odlišný úkon. Iný účet alebo nepárovaný kľúč nemôže konať.
4. Mobilný endpoint overí podpis, očakávané bajty, nonce, účel, účet, device aj PC binding a aktuálnu aktívnosť zariadenia. Krátka transakcia dovolí jediný prechod `PENDING_MOBILE -> APPROVED` alebo `REJECTED`. Mobil nedostane `Set-Cookie` pre webovú session.
5. PC polluje stav iba vlastnej transakcie cez pending cookie; interval s horným limitom/backoffom, zastavenie po terminálnom stave, odchode alebo expirácii. Nevracať na verejnom status endpointe údaje účtu alebo tajomstvá.
6. Iba pôvodné PC dokončí `APPROVED -> CONSUMED`. V jednej krátkej DB transakcii znovu skontrolovať politiku, platnosť dôkazov, revokáciu credentialu/zariadenia a pending väzbu, spotrebovať transakciu, nahradiť starú session a vytvoriť novú C session. Po odvolaní faktora alebo zmene politiky nesmie staré APPROVED prihlásenie uspieť.
7. Timeout, odmietnutie, zrušenie alebo výpadok siete nevytvoria fallback reláciu. Pri strate odpovede po spotrebe transakcie navrhnúť jasný bezpečný reštart alebo osobitne overenú idempotentnú obnovu; opakované dokončenie nevytvorí ďalšiu session.
8. Po dokončení serverového toku a jeho testov umožniť obmedzený skúšobný C flow na účte s pripravenými faktormi. Až jeho úspešné overenie umožní výslovnú aktiváciu C politiky. Tá zmení bezpečnostnú verziu účtu a atomicky odvolá nevyhovujúce relácie/pending transakcie; nesmie ponechať použiteľnú slabšiu reláciu.

Koncové stavy sú `CONSUMED`, `EXPIRED`, `REJECTED`, `CANCELLED`; žiadny návrat na skorší stav. Mobilné approval/rejection sa nesmie preniesť na nové prihlásenie opakovaným skenovaním starého QR. QR nie je dôkaz fyzickej blízkosti a zostáva riziko relay/phishingu; UI a dokumentácia to nesmú sľubovať.

**Brána:** fyzický tok YubiKey -> QR -> biometria -> session iba na PC a úspešné negatívne i súbežné testy.

## OpenAPI a oddelenie webových a mobilných rout

Navrhované skupiny sú `auth/b/*`, `auth/c/start|webauthn|status|complete|cancel`, `account/webauthn/*`, `account/pairings/*`, `account/devices/*` a oddelené `mobile/pairings/*`, `mobile/auth/challenge|resolve|approve|reject`. Ide o návrh názvov, nie existujúce API.

- Browserové mutácie: pôvodná cookie ochrana, presný Origin a JSON, explicitná autorizácia účtu/relácie/transakcie.
- Mobilné operácie: samostatné controller/guard pravidlá, serverové jednorazové výzvy a kryptografický dôkaz podľa operácie; bez webových session cookies. Native Origin je nepostačujúci autentifikačný dôkaz. Pred párovaním je oprávnenie úzko obmedzené na enrollment challenge/capability a dôkaz držby kandidátskeho kľúča.
- Obmedziť veľkosť a počet certifikátov, binárnych/base64 polí a requestov. Atestačným routam prideliť konkrétny primeraný limit, neodstrániť globálne ochranu veľkosti. Caddy logy, aplikačné logy a telemetry nesmú ukladať QR/capability tokeny či podpisové payloady s tajomstvami; capability neposielať v cestách/query, ktoré sa môžu logovať.
- Dokumentovať stavové prechody, TTL, kódy chýb, spotrebu výzvy, retry pravidlá a autentifikačné požiadavky každého endpointu. Do CI pridať validáciu OpenAPI a Kotlin/TS kontraktové fixtures.

## Etapa 6: odvolanie, obnova a prevádzka

- Správa zariadení a credentialov vyžaduje čerstvé overenie podľa aktuálnej politiky. Odvolanie odstrihne súvisiace rozpracované prihlásenia a relácie; finálne overenie i `/me` musia rešpektovať zmenenú bezpečnostnú verziu.
- Bezpečne spracovať odvolanie posledného faktora: odmietnuť operáciu alebo účet výslovne zablokovať s kontrolovanou obnovou. Nezapínať automaticky A/B. Záložný YubiKey ani záložný telefón nemenia požiadavku na obidva druhy faktorov C.
- Pre prototyp zdokumentovať kontrolovaný administrátorský postup obnovy identity, auditu, odvolania starých faktorov/relácií a obmedzeného nového enrollmentu. Recovery oprávnenie nesmie samo vydávať bežnú session ani umožniť nepozorované zníženie politiky. E-mail alebo recovery kód sám osebe nedokončí C. Produkčné použitie potrebuje dokončený a overený recovery návrh.
- Auditovať vytvorenie/odvolanie faktorov, zmenu politiky, výsledok prihlásenia a obnovu prostredníctvom interných korelačných ID a výsledkov; bez tokenov, hesiel, OTP, QR a privátnych/biometrických údajov. Určiť retenciu.
- Doplniť health/readiness podľa reálnej dostupnosti, limity pollingu, cleanup, synchronizáciu času, zálohy a obnovu DB, šifrovacieho kľúča a CA, aktualizácie atestačných trust anchors/metadát a obmedzený prístup k tajomstvám. Sťahovanie metadát neprebieha v otvorenej DB transakcii; výpadok nesmie oslabiť trust politiku.

## Testovacia matica a podmienky dokončenia

| Vrstva | Povinné scenáre | Čo tým nie je dokázané |
| --- | --- | --- |
| Jednotkové testy | politika a čerstvosť dôkazov, účel/challenge, stavové prechody, expirácia, DTO, JWS kódovanie | Správanie reálneho kľúča/biometrie |
| PostgreSQL integračné testy | replay, iný účet/credential/PC, zmena politiky počas flow, odvolanie počas approve/complete, súbežná registrácia/pairing/complete, rollback a jediná session | Prehliadač a hardvér |
| WebAuthn negatívne fixtures | iný challenge/origin/RP ID, zlý podpis/typ/algoritmus, chýbajúce UP/UV, chybný userHandle, revokácia, atestácia none/self-signed/neznámy root | Že pripojené zariadenie je fyzický podporovaný YubiKey |
| Browser E2E s virtuálnym autentifikátorom | registrácia B/C, B login, discoverable C prvý krok, cancel/timeout, cookie a UI izolácia, polling cleanup, regresia A | USB, dotyk, fyzický PIN a firmware |
| Kotlin JVM a kontrakt | serializácia OpenAPI, TS/Kotlin podpisové fixtures, chybové odpovede, deterministické state/Flow, dvojitý tap, stale odpoveď | Reálna Keystore ochrana a biometria |
| Compose a device testy | accessibility, rotácia/process recreation, navigácia, TLS trust, kamera/QR, lockout, key invalidation | Samotný screenshot nepotvrdzuje MFA |
| Manuálne fyzické overenie | YubiKey model/firmware, UP/UV/PIN, Android model/verzia, iba silná biometria, odmietnutie PIN fallbacku, zmena biometrie, C celý tok, strata siete, CA a revokácia | Univerzálna podpora všetkých zariadení |

Osobitne testovať, že QR capability neumožní polling/dokončenie na inom PC, cudzí telefón nevidí detail účtu, neautorizované rejection nespôsobí zamietnutie a zamenený pairing kandidát sa neaktivuje. Testy musia pokryť oddelenie B/C credential profilov a všetky kombinácie povolených režimov. Test migrácie nesmie priradiť starým reláciám nové faktorové dôkazy.

Použiť existujúce `pnpm build`, `pnpm check` a izolovaný `compose.test.yaml`; nové testy a browser/Android tasky najprv reálne zaviesť a až potom uviesť overené príkazy. Projektové Android referencie dnes obsahujú historické scaffold obmedzenia a musia sa aktualizovať podľa skutočne vytvoreného buildu. Žiadne neexistujúce `make verify` ani upstream generátory.

Každý míľnik má presné príkazy, výsledky a nepokryté manuálne kroky. B/C sa označia za hotové až po fyzickom overení príslušného toku. Nezávislý reviewer skontroluje politiku, enrollment, finalizáciu a odvolanie pred zapnutím režimu.

## Navrhované samostatné PR a závislosti

1. `docs/config`: ADR, lokálny Docker Compose/Caddy/PostgreSQL profil, DNS/TLS/RP ID, threat model, kontrakt a hardvérový experiment; bez deklarovania hotového MFA.
2. `auth-core`: politika, dôkazy relácie, čerstvé overenie, verzie, účelové transakcie, migrácia a regresie A. Overiť A cez lokálny DNS a HTTPS pred registráciou B/C.
3. `webauthn-enrollment`: validovaná registrácia B, atestačná politika, revokácia a testy.
4. `mode-b`: backend dokončenie B, webové obrazovky, E2E a fyzické overenie. Samostatný použiteľný míľnik.
5. `android-foundation`: reálny build, TLS/kontrakt, Keystore/JWS, oddelené UI/state a testy; môže bežať po PR 1 súbežne s PR 2–4 pri stabilnej verzii kontraktu.
6. `mode-c-enrollment`: C credential a pairing backend/web/Android s atestáciou; závisí od spoločného core, WebAuthn a Android podpisovej hranice. Pripravuje faktory bez zapnutia C politiky.
7. `mode-c-login`: oba faktory v jednej transakcii, mobile approval, polling, atomická finalizácia, fyzické E2E a bezpečná aktivácia politiky po skúšobnom C.
8. `operations/recovery`: dokončenie recovery/prevádzkových postupov, audit, hardening a release evidencia. Základná revokácia a potrebný audit vznikajú už s príslušným faktorom, neodkladajú sa na toto PR.

PR môže byť ďalej rozdelené podľa rozsahu; každé musí obsahovať testy a nesmie samostatným nasadením otvoriť neúplný režim. CI simulácie a fyzické protokoly sa evidujú oddelene. Po PR 4 možno zastaviť pri hotovom B s pripravenými základmi C.

## Overené primárne zdroje

- [W3C WebAuthn](https://www.w3.org/TR/webauthn-3/): RP ID/doména, účely registračnej a autentifikačnej operácie, discoverable credentials, UP/UV a bezpečnostné hranice.
- [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server) a [browser](https://simplewebauthn.dev/docs/packages/browser): generovanie a overovanie options/response; konkrétne verzie vybrať pri implementácii.
- [SimpleWebAuthn Settings Service](https://simplewebauthn.dev/docs/advanced/server/settings-service): certificate-path validácia závisí od konfigurácie root certifikátov; samotné `verified` nie je kompletná výrobcovská trust politika.
- [Yubico: User Presence vs User Verification](https://developers.yubico.com/WebAuthn/WebAuthn_Developer_Guide/User_Presence_vs_User_Verification.html) a [resident keys](https://developers.yubico.com/WebAuthn/WebAuthn_Developer_Guide/Resident_Keys.html): profil a fyzické overenie kľúča.
- [Android: biometrické overenie](https://developer.android.com/identity/sign-in/biometric-auth): CryptoObject, autorizácia použitia kľúča a rozdiel biometrie a device credential.
- [Android: key attestation](https://developer.android.com/privacy-and-security/security-key-attestation): serverová validácia reťazca a revokácie; nutnosť aktualizovať dôveryhodné korene.
- [Android: Network Security Configuration](https://developer.android.com/privacy-and-security/security-config): explicitná dôvera vývojovej CA bez vypnutia TLS.
- [JWS, RFC 7515](https://www.rfc-editor.org/rfc/rfc7515.html) a [JWA, RFC 7518](https://www.rfc-editor.org/rfc/rfc7518.html): štandardná podpisová obálka a ECDSA kódovanie.
