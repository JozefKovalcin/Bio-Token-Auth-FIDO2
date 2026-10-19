# Režim A: spustenie a test v lokálnej sieti

Pri overení režimu A v lokálnej sieti (LAN, Local Area Network) používame samostatný počítač so serverom a druhý počítač s prehliadačom. Druhý faktor poskytuje časovo odvodené jednorazové heslo TOTP (Time-Based One-Time Password), ktoré vytvára autentifikačná aplikácia. Server vyžaduje Docker Desktop s bežiacim Linux enginom a PowerShell. Node.js aj PostgreSQL sa spúšťajú v kontajneroch, preto ich na hostiteľskom počítači neinštalujeme. Účet Open Design sa pri prevádzke aplikácie nepoužíva.

## 1. Server

Po rozbalení projektu otvoríme PowerShell v jeho hlavnom priečinku. Príkazom `ipconfig` zistíme IPv4 adresu servera v lokálnej sieti. V príklade používame adresu `192.168.1.50`, ktorú je potrebné nahradiť skutočnou adresou. Keďže HTTPS certifikát a kontrola pôvodu požiadaviek závisia od tejto adresy, pri opakovanom testovaní je vhodná jej rezervácia na DHCP serveri.

```powershell
./scripts/Start-Lan.ps1 -AppHost 192.168.1.50
docker compose ps
docker compose logs --tail 30 api
```

Skript skontroluje Docker Desktop a Linux engine, pri prvom spustení vytvorí `.env` a počká na pripravené kontajnery. V overenej konfigurácii bol server dostupný na `https://192.168.77.5`; na inej sieti použite adresu z `ipconfig` a hodnotu `APP_HOST` v `.env`. Pri ďalšom spustení sa kľúče zachovajú. Pri zmene IP upravte iba `APP_HOST` a obnovte kontajnery príkazom `docker compose up --build -d --wait`.

Skript `Init-Lan.ps1` vytvorí súbor `.env` s náhodným heslom databázy a samostatným 256-bitovým kľúčom na šifrovanie TOTP tajomstiev. Existujúcu konfiguráciu neprepíše, aby pri opakovanom spustení nezmenil kľúč k uloženým údajom. Súbor sa nezdieľa ani neukladá do Gitu. Strata šifrovacieho kľúča znemožní dešifrovanie existujúcich TOTP tajomstiev. Identifikátory prihlásených relácií sú náhodné a databáza obsahuje iba ich SHA-256 odtlačky, preto táto implementácia nepoužíva samostatný `SESSION_SECRET`.

Publikované sú iba TCP 80 a 443. Ak spojenie z druhého zariadenia blokuje Windows Firewall, povoľte TCP 443 na súkromnom profile pre lokálnu podsieť; TCP 80 je voliteľný pre presmerovanie z HTTP. Príklad pre správcu:

```powershell
New-NetFirewallRule -DisplayName 'Bio Token HTTPS LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -Profile Private -RemoteAddress LocalSubnet
```

## 2. Dôvera HTTPS

Caddy vystavuje HTTPS certifikát pre zadanú adresu pomocou vlastnej certifikačnej autority (CA, Certificate Authority). Prehliadač na druhom počítači túto autoritu štandardne nepozná, preto do jeho dôveryhodného úložiska importujeme verejný koreňový certifikát. Tým umožníme overenie certifikačného reťazca bez vypnutia kontroly certifikátu. Použitý mechanizmus `tls internal` a export koreňového certifikátu opisuje [dokumentácia Caddy](https://caddyserver.com/docs/running#local-https-with-docker).

```powershell
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./bio-token-root.crt
certutil -hashfile ./bio-token-root.crt SHA256
certutil -user -addstore Root ./bio-token-root.crt
```

Na druhom počítači importujte verejný certifikát do úložiska Root. Privátny kľúč CA z Docker volume nikdy nekopírujte. Firefox môže vyžadovať vlastný import CA v nastaveniach certifikátov. Po importe reštartujte prehliadač a otvorte `https://192.168.1.50`. Certifikát sa bude považovať za dôveryhodný na zariadeniach, kam ste túto lokálnu CA pridali.

Pre iPhone vygenerujte profil s verejným koreňovým certifikátom:

```powershell
./scripts/Export-Ios-CA.ps1
```

Preneste súbor `infra/data/bio-token-ios-ca.mobileconfig` do iPhonu cez dôveryhodný súkromný prenos súboru. Profil obsahuje verejný certifikát, nikdy privátny kľúč. V iPhone otvorte **Nastavenia → Všeobecné → VPN a správa zariadenia**, vyberte stiahnutý profil a nainštalujte ho. Potom otvorte **Nastavenia → Všeobecné → Informácie → Nastavenia dôveryhodnosti certifikátov** a zapnite plnú dôveru pre **Bio Token Auth LAN CA**. Manuálne nainštalovaný koreňový certifikát sa v iOS automaticky nepovažuje za dôveryhodný pre TLS; treba povoliť plnú dôveru podľa [pokynov Apple](https://support.apple.com/en-us/102390).

Pripojte iPhone k rovnakej Wi-Fi sieti a v Safari otvorte `https://192.168.1.50`. Použite aktuálnu adresu servera z `.env`. Ak sa stránka neotvorí, povoľte TCP 443 vo Windows Firewalle pre lokálnu podsieť a skontrolujte, že Wi-Fi router neizoluje klientov. Certifikát je vytvorený pre konkrétny hostiteľský názov alebo IP adresu; pri zmene adresy ho treba znovu vystaviť a nainštalovať nový profil.

Na pridanie aplikácie na plochu otvorte stránku v Safari, stlačte **Zdieľať → Pridať na plochu**, zapnite **Otvoriť ako webovú aplikáciu** a potvrďte **Pridať**. Ak sa možnosť **Pridať na plochu** nezobrazuje, pridajte ju cez úpravu akcií ponuky Zdieľať. Aktuálny postup opisuje [dokumentácia Apple k webovým aplikáciám](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios). Aplikácia má manifest a ikonu pre plochu; prihlásenie vyžaduje dostupný server a offline režim nie je implementovaný.

## 3. Účet a prvé prihlásenie

1. Otvorte HTTPS adresu v prehliadači alebo v Safari na iPhone a zvoľte **Vytvoriť účet**.
2. Zadajte jedinečné používateľské meno a heslo s dĺžkou 8 až 128 znakov. Heslo zadajte ešte raz na potvrdenie. Po registrácii sa otvorí účet.
3. TOTP možno zapnúť hneď tlačidlom **Nastaviť TOTP teraz** alebo neskôr po prihlásení.
4. Pri nastavení naskenujte QR kód v 2FAS, Google Authenticatori alebo kompatibilnej aplikácii a zadajte prvý šesťmiestny kód. Ručný kľúč je dostupný pod odkazom pri QR.
5. Odhláste sa a skúste sa prihlásiť znova. Keď je TOTP aktívne, server prijme reláciu až po správnom aktuálnom kóde; ten istý 30-sekundový krok nemožno použiť opakovane.

Účet bez aktívneho TOTP sa prihlasuje iba heslom. Aktiváciu odporúčame dokončiť počas registrácie alebo hneď po nej.

Ak nastavujete TOTP na tom istom iPhone, fotoaparát nemôže naskenovať QR kód z obrazovky telefónu. V autentifikačnej aplikácii preto zvoľte ručné zadanie kľúča a opíšte hodnotu pod odkazom **Chcem zadať kľúč ručne**. Tajomstvo nikomu neposielajte a po aktivácii ho znovu nezobrazujte.

## 4. Test z druhého PC

Po importovaní CA spustite v rozbalenom projekte na druhom PC:

```powershell
./scripts/Test-Lan.ps1 -Origin https://192.168.1.50
```

Na serveri možno overiť certifikát bez jeho importu do Windows úložiska: `node tests/https-smoke.mjs https://192.168.1.50 infra/data/bio-token-root.crt`. Skript kontroluje reťazec aj IP adresu certifikátu, API health, neprihlásený prístup, ochranu `Origin`, CSP a presmerovanie HTTP. Prehliadač na druhom zariadení potrebuje dôverovať verejnému koreňovému certifikátu podľa predchádzajúcej časti.

Skript `Test-Lan.ps1` najprv vykoná HTTPS požiadavku s bežnou kontrolou certifikátu. Následne porovná stav rozhrania API s hodnotou `ok`, skontroluje dostupnosť webovej stránky a očakáva stavové kódy 403 pri požiadavke bez `Origin` a 401 pri prístupe bez prihlásenej relácie. Výpis PASS vznikne až po splnení všetkých týchto kontrol. Keďže skript nezadáva heslo ani TOTP, úplné prihlásenie overíme samostatne podľa nasledujúcich prípadov.

| Test | Očakávaný výsledok |
| --- | --- |
| Nesprávne heslo | Chyba; žiadny prístup k účtu |
| Registrácia s platným menom a heslom | Účet vznikne a otvorí sa relácia |
| Opakované používateľské meno | Registrácia odmietnutá |
| Krátke heslo | Registrácia odmietnutá |
| Účet bez aktívneho TOTP | Prihlásenie dokončí heslo |
| Zapnutie TOTP | Prvý platný kód aktivuje faktor |
| Prihlásenie s aktívnym TOTP | Heslo bez kódu nevytvorí novú reláciu |
| Nesprávny kód | Chyba; vstup zostáva dostupný |
| Päť nesprávnych kódov | Pending overenie už neprijme ani správny kód; začnite znova |
| Opakované pokusy cez nové overenia | Účtový limit TOTP po 10 pokusoch za 5 minút |
| Desať pokusov hesla | Ďalší pokus za 5-minútové okno je obmedzený |
| Čakanie viac než 5 minút | Pending overenie vyprší, nový začiatok |
| Použitie už prijatého kódu | Zamietnuté; počkajte na ďalší kód |
| Dva súčasné pokusy s rovnakým kódom | Úspeje iba jeden |
| Obnovenie stránky po úspechu | Prihlásenie zostane platné |
| Odhlásenie a návrat/obnovenie | Chránené API odmietne starú reláciu |
| Mobilný prehliadač / klávesnica | Čitateľné formuláre, viditeľný fokus a stav |

Zapíšte OS, prehliadač, adresu servera, autentifikačnú aplikáciu a výsledky. Na serveri aj telefóne zapnite automatický čas; tolerancia TOTP je ±30 sekúnd. Relácia trvá 8 hodín bez automatického predlžovania.

## 5. Automatické bezpečnostné testy

Samostatná Compose zostava používa iba dočasnú testovaciu databázu a neotvára jej port:

```powershell
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
docker compose -f compose.test.yaml down
```

Automatické testy komunikujú s API a skutočným PostgreSQL. Pre každý prípad vytvoria izolovaný účet a porovnajú odpovede servera aj zmeny databázových záznamov s očakávaným výsledkom. Overujú prvú aktiváciu TOTP, vlastnosti cookies, kontrolu `Origin`, expiráciu, opakované použitie kódu, súbežné dokončenie, zámenu účtov, politiku režimov, odhlásenie a obmedzenie pokusov. Kódy pre testovacie účty vytvára knižnica otplib. Úspech automatických testov sa preto posudzuje oddelene od manuálneho overenia s autentifikátorom používateľa.

Pre vývoj s vlastnou testovacou databázou: Node 24+, pnpm 11.25.0, `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm check`. Nastavte `DATABASE_URL` na vyhradenú DB, vykonajte `pnpm db:deploy`, nastavte rovnaké `TEST_DATABASE_URL` a spustite `pnpm test`. Názov testovacej DB musí končiť `_test`; testy nikdy nespúšťajte na reálnych používateľoch.

## 6. Zastavenie a hranice

`docker compose down` zastaví aplikáciu a zachová databázu aj CA vo volumes. Použitie `down -v` tieto údaje zmaže. Po zmene IP upravte APP_HOST v `.env` a znovu vytvorte kontajnery; používajte novú URL. Nevymazávajte pritom TOTP_ENCRYPTION_KEY ani volume Caddy.

Režimy B/C majú softvérovú implementáciu, ale predvolene sú vypnuté do konfigurácie dôvery a hardvérového overenia. Postup pre DNS, YubiKey a Android je v modes-b-c.md. Server povoľuje A iba účtom s `allowedModes` obsahujúcim `A`; klient túto politiku nezmení. Správa faktorov a klasifikovaný audit sú implementované; samoobslužná obnova nie je dostupná. Toto je LAN výskumný prototyp, nie hotové verejné nasadenie.
