# Android klient pre režim C

Samostatný Kotlin/Compose klient obsahuje párovanie, lokálne skenovanie QR cez CameraX a ZXing, autorizované načítanie požiadavky a biometrický podpis cez Android Keystore. QR sa spracúva lokálne v telefóne. Privátne kľúče a biometrické údaje neopúšťajú telefón. Telefón nezískava webovú session.

Implementovaný kód ešte nie je dôkazom funkčného hardvérového MFA. Režim C zostáva predvolene vypnutý; do prevádzky patrí až po potvrdení atestácie, identity podpisového APK a celého toku na fyzickom telefóne/YubiKey. Postup základného hardvérového overenia a následného zapnutia iba v izolovanom akceptačnom prostredí je v [návode B/C](../../docs/modes-b-c.md). Emulátor, JVM testy a zostavený APK nepotvrdzujú hardvérovú ochranu ani použitý druh biometrie.

## Build a overenie

- JDK 17, Android SDK platform 35, Build Tools 35.0.0; `ANDROID_HOME` alebo ignorovaný `local.properties`.
- Gradle 8.11.1 wrapper, AGP 8.9.2, Kotlin/Compose compiler 2.1.20; presné verzie sú v `gradle/libs.versions.toml`.
- Minimum Android 11/API 30; pre demo overený telefón s odtlačkom a `BIOMETRIC_STRONG`.
- Otvorte priečinok `apps/android` v Android Studio alebo použite príkazy nižšie. Node/pnpm build Android nenahrádza.

PowerShell v tomto priečinku:

```powershell
./gradlew.bat spotlessCheck :core:test :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest -PbioServiceOrigin=https://auth.bio-token.test
```

Na Linux/macOS použite `bash ./gradlew` s rovnakými taskmi. `spotlessApply` slúži na formátovanie. Device/Compose testy spustí `:app:connectedDebugAndroidTest` až na skutočne dostupnom zariadení. Neexistujú tu upstream `make verify`, generátor modulov ani screenshot tasky.

`./scripts/Verify-Android.ps1` používa tieto reálne tasky a vie využiť lokálny ignorovaný `.tooling` runtime, ak bol pripravený počas vývoja. Samotný skript nástroje neinštaluje ani nemení systémové prostredie.

APK je `app/build/outputs/apk/debug/app-debug.apk`. Inštalácia na telefón:

```powershell
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Release application ID je `sk.biotoken.android`, debug je `sk.biotoken.android.debug`. Serverová atestačná politika musí kontrolovať skutočné application ID a SHA-256 podpisového certifikátu konkrétneho APK. Debug podpis nie je produkčný podpis. Privátne signing kľúče nepatria do Gitu.

## Server a TLS v LAN

`bioServiceOrigin` je dôveryhodný build parameter, nie hodnota prevzatá z QR. Použite presne rovnaký HTTPS origin ako serverový `APP_ORIGIN`; bez koncového lomítka a bez cesty. Predvolený názov je `https://auth.bio-token.test`. PC aj telefón ho musia vedieť preložiť na server.

Debug zostavenie generuje Network Security Config povoľujúci používateľom nainštalovanú CA výhradne pre tento nakonfigurovaný hostname, bez subdomén. Na telefón bezpečne nainštalujte iba verejný koreňový certifikát správnej LAN CA a overte jeho odtlačok dôveryhodnou cestou. Súkromný CA kľúč zostáva na serveri. Android aplikácie automaticky nedôverujú všetkým používateľským CA.

Release zostavenie dôveruje systémovým CA. Pre samostatné podpísané LAN release APK treba zámerne dodať konkrétnu verejnú CA a upraviť príslušný trust profil; release nezdedí debug dôveru používateľským CA. V žiadnom variante sa nevypína overovanie reťazca/hostname, nepovoľuje HTTP ani nesleduje presmerovanie na iný server.

QR má podľa OpenAPI tvar `{"v":1,"type":"pairing"|"login","token":"<opaque capability>","origin":"<configured HTTPS origin>"}`. Hodnota capability sa prenáša iba v JSON tele HTTPS požiadaviek. Aplikácia QR neotvára ako URL, neinštaluje podľa neho CA a nezapisuje ho do logov.

## Kryptografická a API hranica

`:core` obsahuje Kotlin DTO, striktné rozpoznanie QR/originu/účelu/expirácie, JOSE podpisovú hranicu a HTTP klienta. Kontrakt je `../../packages/contracts/openapi.yaml`; Kotlin serializačné testy pokrývajú povinné JWK polia a endpointy. TypeScript typy sa do Androidu neimportujú.

Každé spárovanie vytvára dve odlišné EC P-256 Keystore dvojice s výzvou servera:

- Approval kľúč: iba `PURPOSE_SIGN`, SHA-256, `setUserAuthenticationParameters(0, AUTH_BIOMETRIC_STRONG)`, zneplatnenie pri zmene biometrického zápisu. Podpis umožní iba `BiometricPrompt.CryptoObject(Signature)`. PIN/device credential fallback nie je povolený.
- Device-auth kľúč: autorizuje jednorazové serverové request výzvy pre resolve/reject/status; nemôže nahradiť approval kľúč.

Server určuje presný JWS Signing Input. Klient pred podpisom preverí header ES256/`bio-mobile+jws`, audience, účel, expiráciu a kontextové väzby vrátane účtu/transakcie zobrazenej na schvaľovacej obrazovke. Podpisuje celé nezmenené `base64url(header).base64url(payload)`. Nimbus JOSE zabezpečuje štandardný DER/JOSE ECDSA prevod. Fixture vytvorená Node.js v `core/src/test/resources/jws-node-fixture.json` neobsahuje privátny kľúč.

Oba verejné kľúče a oba atestačné reťazce sa predkladajú backendu; klient nepredstiera overenie atestácie. Kandidát zostáva neaktívny, kým používateľ na pôvodnom PC nepotvrdí rovnaký porovnávací kód. V úložisku sú iba verejné identifikátory zariadenia, aliasy kľúčov, origin a porovnávací kód. QR, podpisy a capabilities sa neukladajú. Backup je vypnutý.

## Stav a správanie pri prerušení

Čisté `ApprovalScreen(state, callbacks)` nemá ViewModel, sieť ani kryptografiu. `ApprovalViewModel` vystavuje immutable UI stav cez StateFlow; `MainActivity` koordinuje platformový prompt a kameru. Prompt sa spustí iba výslovným kliknutím. Rotácia/odchod z aplikácie zruší aktívnu operáciu a oneskorený callback sa ignoruje. Obnova procesu obnoví iba uloženú identitu zariadenia, nikdy súhlas, QR ani podpis.

Po chybe počas odosielania aplikácia nevyhlasuje úspech a automaticky nevydáva nový podpis; používateľ overí výsledok na PC a bezpečne začne znova. Zneplatnený biometrický kľúč sa nenahrádza potichu. Zariadenie treba odvolať podľa serverovej politiky a kontrolovane znovu spárovať; miestne kľúče možno vymazať až po autentifikovanom potvrdení odvolania.

## Požadované fyzické overenie

Zaznamenajte model/Android, security level, podpisový certifikát APK a podporovaný YubiKey/firmware/browser. Overte pairing + PC potvrdenie, iba odtlačok na vybranom telefóne, zamietnutie/cancel/lockout bez PIN fallbacku, nový biometrický zápis, odvolanie, chybnú CA/hostname, rotáciu/process death, sieťový výpadok, expiráciu a celý C tok so session iba na PC. `BIOMETRIC_STRONG` všeobecne neznamená výhradne odtlačok.

Automatické JVM testy používajú fake platformové hranice; device testy sú oddelené v `src/androidTest`. Výsledky konkrétneho behu patria do projektového záznamu overenia, nie do tvrdení o univerzálnej podpore hardvéru.

## Interaktívny lokálny CryptoObject test pred zapnutím C

`OfflineBiometricPromptTest` preveruje skutočné `DeviceKeys` bez servera, siete, QR, párovania alebo session. Je iba v test APK a používa vlastný `OfflineBiometricRunner` s obyčajným `Application`; nespúšťa produkčný `BioTokenApplication`, jeho čítanie `DeviceStore` ani upratovanie ostatných aliasov. Hostom je existujúca prázdna debug `ComponentActivity`, nie `MainActivity`. Test nemení produkčné API, UI, podpis aplikácie ani brány C.

Bežný `connectedDebugAndroidTest` a CI tento test preskočia: vyžaduje súčasne samostatný runner a výslovný argument `interactiveBiometric=true`. Zostavenie test APK nevyžaduje telefón a nespúšťa prompt:

```powershell
./gradlew.bat spotlessCheck :app:lintDebug :app:assembleDebugAndroidTest -PbioServiceOrigin=https://auth.bio-token.test
```

Interaktívny beh sa smie spustiť až po fyzickom overení B, na vyhradenom telefóne so zapísaným silným odtlačkom a po vedomej inštalácii kompatibilného debug APK aj `app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk`. Neprepisujte odlišne podpísanú spárovanú aplikáciu a neodinštalujte ju kvôli testu. Samotný beh neinštaluje APK:

```powershell
adb shell am instrument -w -r -e interactiveBiometric true sk.biotoken.android.debug.test/sk.biotoken.android.OfflineBiometricRunner
```

Na telefóne sú dva samostatné výslovné kroky. Najprv stlačte **Spustiť test odtlačku** a potvrďte systémový prompt skutočným zapísaným odtlačkom. Potom stlačte **Spustiť test zrušenia** a v systémovom prompte zvoľte **Zrušiť**; v druhom kroku nepoužívajte odtlačok. Každý krok čaká najviac 180 sekúnd. Opakované chybné odtlačky ani lockout sa nevyvolávajú. Odchod z aktivity, chyba alebo neplánovaný súhlas v druhom kroku test ukončia neúspešne.

Test vytvorí iba dve nové dočasné `bio-test-UUID` dvojice cez skutočné `DeviceKeys`, s náhodnou lokálnou atestačnou výzvou. Preverí lokálne hlásenú hardvérovú ochranu a per-use silnú biometrickú politiku. Pred súhlasom požaduje rozpoznateľné odmietnutie neoprávneného podpisu. Platformový `BiometricPrompt` povoľuje iba `BIOMETRIC_STRONG` a používa `CryptoObject(Signature)`, bez PIN/device credential fallbacku. Podpíše náhodný payload s jednoznačným lokálnym testovým prefixom, výsledok overí verejným kľúčom toho istého aliasu a preverí, že ďalšia čerstvá operácia znovu vyžaduje biometriu. Zrušený krok nikdy nevytvára podpis ani JWS; po zrušení musí nová neoprávnená operácia opäť zlyhať.

Vlastný výstup obsahuje iba pevné `PASS`/`FAIL_*` výsledky vrátane `PASS_SIGNATURE_VERIFIED`, `PASS_PER_USE` a `PASS_CANCELLED_NO_SIGNATURE`; žiadne payloady, aliasy, podpisy ani certifikáty sa nevypisujú. Pri bežnom ukončení aj výnimke sa vo `finally` mažú výhradne oba vlastné UUID aliasy. Násilné ukončenie procesu alebo vypnutie telefónu nemusí umožniť vykonanie `finally`; test nikdy plošne nevyhľadáva ani nemaže ostatné kľúče. Neznáme platformové chyby neoprávneného podpisu sa nepovažujú za úspešné odmietnutie (`FAIL_AUTH_DENIAL_UNCLASSIFIED`).

Tento výsledok je iba **lokálny hardvérový/CryptoObject test**. Nepotvrdzuje AndroidX/MainActivity lifecycle a callback integráciu, serverovú atestáciu, revokácie, párovanie ani celý C tok. `BIOMETRIC_STRONG` samo osebe nepreukazuje výhradne odtlačok; jeho skutočné použitie na overenom snímači musí potvrdiť pozorovaný fyzický krok. Výsledky ani preskočenie testu automaticky nemenia serverové nastavenia C.
