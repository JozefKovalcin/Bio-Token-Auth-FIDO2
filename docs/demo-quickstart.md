# Školské demo: spustenie a skúška A/B/C

Rozsah je školská úloha: tri prihlasovacie režimy, ich rozhranie a overenie faktorov. Obnova účtov, verejný hosting a produkčný recovery portál nie sú podmienkou dokončenia dema. Firebase sa nepoužíva. Základný fyzický C tok na notebooku prešiel 2. novembra 2026; nevykonané negatívne scenáre zostávajú oddelené vo [verification.md](verification.md).

Pre zachovanú inštanciu na tomto notebooku použite krátky [postup spustenia a vypnutia](spustenie-vypnutie.md). Nasledujúce časti pokrývajú aj prípravu iného zariadenia.

## 1. Aktualizácia notebooku

PowerShell otvorte v priečinku existujúceho projektu:

```powershell
git status
git pull --ff-only origin main
```

Ak `git status` ukáže vlastné rozpracované zmeny, najprv ich zachovajte; nepoužívajte `reset --hard`. Na novom PC možno namiesto pull použiť:

```powershell
git clone https://github.com/JozefKovalcin/Bio-Token-Auth-FIDO2.git
cd Bio-Token-Auth-FIDO2
```

Git prenáša zdrojový kód, nie `.env`, databázu, CA, verejné trust súbory, SDK ani APK. **Na notebooku s existujúcim demom zachovajte jeho konfiguráciu a volumes.** Nevyvolávajte nový `Init-Lan.ps1`, nemeňte TOTP kľúč ani CA a neodinštalujte existujúcu Android aplikáciu.

## 2. Spustenie existujúceho servera na notebooku

Potrebujete Docker Desktop s Linux enginom. Predtým overený hostname je `auth.bio-token.test`; musí fungovať na PC aj telefóne. Po zmene Wi-Fi môže mať notebook inú LAN IP, ktorú treba upraviť v lokálnom DNS. Ak bol na notebooku pripravený vlastný DNS skript, je iba lokálny:

```powershell
# Iba na notebooku, kde tento skript už existuje:
if (Test-Path .tooling/start-local-dns.ps1) {
    & ./.tooling/start-local-dns.ps1
}

docker compose --profile mode-c up --build -d --wait
docker compose --profile mode-c ps
Invoke-RestMethod https://auth.bio-token.test/api/health
Start-Process https://auth.bio-token.test/
```

Profil `mode-c` spustí aj interný atestačný verifier; **sám nepovoľuje C**. Jeho balík a signer v `.env` musia zodpovedať skutočnej aplikácii. Ak C ešte nenastavujete a konfigurácia verifiera chýba, spustite iba základ: `docker compose up --build -d --wait`.

Telefón pripojte do rovnakej LAN. Pri predchádzajúcom overení potreboval Wi-Fi DNS smerujúci na notebook a Súkromný DNS nastavený na Automatický. Presná konfigurácia závisí od siete. Po skončení lokálneho DNS vráťte telefón na bežné DHCP/DNS.

### Ak je to úplne nová inštalácia

Najprv nastavte DNS pre `auth.bio-token.test` na IP tohto servera na routeri/lokálnom DNS. Potom:

```powershell
./scripts/Start-Lan.ps1 -AppHost auth.bio-token.test
New-Item -ItemType Directory -Force infra/data | Out-Null
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt infra/data/bio-token-root.crt
certutil -hashfile infra/data/bio-token-root.crt SHA256
certutil -user -addstore Root infra/data/bio-token-root.crt
```

Overte odtlačok verejnej CA a importujte ju aj na testovací Android podľa [LAN návodu](lan-test.md). Súkromný CA kľúč sa neprenáša. Nová inštancia má novú DB/CA a nové testovacie účty; WebAuthn a C zostávajú vypnuté. Pre B/C používajte hostname, nie holú IP. Podrobné trust nastavenie je v [modes-b-c.md](modes-b-c.md).

## 3. Zostavenie Android aplikácie

Na notebooku použite jeho existujúci signing setup. Potrebné sú JDK 17, Android SDK platform 35 a Build Tools 35.0.0. Projektový skript využije už pripravené nástroje v `apps/android/.tooling`, ak existujú; sám ich neinštaluje.

```powershell
./apps/android/scripts/Verify-Android.ps1 -ServiceOrigin https://auth.bio-token.test

# Zobrazenie verejnej identity podpisu výsledného APK:
& "$env:ANDROID_HOME/build-tools/35.0.0/apksigner.bat" verify --print-certs apps/android/app/build/outputs/apk/debug/app-debug.apk

# Po autorizovaní USB debuggingu na telefóne:
& "$env:ANDROID_HOME/platform-tools/adb.exe" devices
& "$env:ANDROID_HOME/platform-tools/adb.exe" install -r apps/android/app/build/outputs/apk/debug/app-debug.apk
```

APK je v `apps/android/app/build/outputs/apk/debug/app-debug.apk`. Debug application ID je `sk.biotoken.android.debug`. Jeho skutočný signer SHA-256 nastavte ako `ATTESTATION_SIGNING_CERT_SHA256` a ID ako `ATTESTATION_PACKAGE_NAME`. Hash súboru APK nie je odtlačok signer certifikátu.

Ak systém odmietne USB inštaláciu, dokončite ju bežným systémovým inštalátorom so súhlasom používateľa podľa [Android README](../apps/android/README.md). Pri konflikte podpisu aplikáciu neodinštalujte ako skratku: stratili by sa jej Keystore kľúče. Použite pôvodný signing setup. Privátne kľúče sa neposielajú cez Git ani chat.

V aplikácii najprv stlačte **Overiť spojenie so serverom**. Očakávajte `REACHABLE`. Pri DNS/TLS chybe opravte sieť/CA/origin podľa vysvetlenia; nevypínajte TLS validáciu.

## 4. Odporúčané poradie skúšky

| Krok | Postup | Očakávanie |
| --- | --- | --- |
| A | Vytvorte testovací účet a prihláste sa heslom | Otvorí sa účet |
| A + TOTP | Zapnite TOTP cez QR, odhláste sa a prihláste znova | Heslo aj aktuálny kód sú povinné; už prijatý časový krok nemožno opakovať |
| B | Zapnite nakonfigurovaný WebAuthn, v správe zabezpečenia pridajte YubiKey pre B a potvrďte kandidáta | Kľúč je aktívny; povoľte B a znovu sa prihláste heslom + tokenom |
| C základ | Overte spojenie aplikácie, skutočný biometrický CryptoObject podpis bez PIN fallbacku podľa Android README a identitu APK | Splnené základné hardvérové predpoklady, nie ešte celý C tok |
| C párovanie | V izolovanom deme nastavte C flagy podľa brány nižšie, pridajte a potvrďte samostatný YubiKey pre C; spárujte telefón cez QR | Oba mobilné kľúče prejdú skutočnou atestáciou; kód potvrďte na pôvodnom PC |
| C trial | Stlačte „Overiť oba faktory pred zapnutím C“ | YubiKey a podpis telefónu patria tomu istému účtu; trial ešte nevydáva login session |
| C login | Povoľte C, uložte politiku a prihláste sa režimom C | Session získa iba pôvodný PC po YubiKey aj mobilnom schválení |

Pre B musí byť v `.env` `WEBAUTHN_ENABLED=true`, správne RP ID, overený root JSON, AAGUID allowlist a pri danom modeli aj už pripravený `WEBAUTHN_INTERMEDIATES_FILE`. Na existujúcom notebooku použite zachované verejné trust podklady; na novej inštancii postupujte podľa [návodu B/C](modes-b-c.md), hodnoty nehádajte.

**C brána:** `MODE_C_ENABLED=true` a `MODE_C_HARDWARE_VERIFIED=true` zapnite iba v izolovanom testovacom deme po základnom fyzickom overení tokenu, biometrického podpisu a identity APK. Potom reštartujte zostavu vyššie a vykonajte skutočnú serverovú atestáciu/párovanie/trial. Pri neúspechu C znovu vypnite. Health verifiera alebo automatické fixtures nie sú úspešná hardvérová atestácia. Ani školské demo nenahrádza podpis klientským booleanom.

Pri prvej skúške ponechajte A/B ako povolené alternatívy, kým nedokončíte C trial. Až na osobitnom testovacom účte skúste politiku iba C. Zmena politiky odhlási relácie; čerstvé prihlásenie je potrebné aj pri dlhom nastavovaní faktorov.

Skúste tiež zrušenie dialógu, nesprávne heslo, vypršaný QR a zamietnutie na telefóne. PIN tokenu nehádajte až do blokácie. Expirované nepotvrdené párovanie obnovíte cez kontrolu stavu v telefóne a explicitné odstránenie serverom odvolaného kandidáta. Nepoužívajte obnovu účtu ako obchádzku faktorov; na školské pokusy možno vytvoriť nový testovací účet.

## 5. Užitočné príkazy

```powershell
# Lokálne softvérové kontroly (Node 24+, pnpm 11.25.0):
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm check:contract
pnpm exec playwright install chromium
pnpm test:browser

# Oddelená dočasná DB, nikdy prevádzková:
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
docker compose -f compose.test.yaml down

# Po skončení dema zachovajte DB a CA:
docker compose --profile mode-c down
```

Nepoužívajte `down -v`, ak chcete zachovať účty a párovania. Chybové logy neposielajte neupravené, ak by obsahovali citlivé údaje. Výsledky fyzických skúšok zapíšte do [verification.md](verification.md), oddelene od automatických testov.
