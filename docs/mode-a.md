# Implementácia autentifikačného režimu A

Režim A umožňuje registráciu a prihlásenie používateľským menom a heslom. Používateľ môže po registrácii aktivovať časovo odvodené jednorazové heslá TOTP (Time-Based One-Time Password). Po aktivácii server vyžaduje pri každom ďalšom prihlásení heslo aj aktuálny kód. Kým faktor nie je aktívny, účet sa prihlasuje iba heslom. Režim A je implementovaný; režimy B a C sú opísané ako ďalšie etapy.

## Zvolené knižnice a usporiadanie projektu

Server sme implementovali v NestJS a TypeScripte. Používateľské rozhranie používa React a zostavuje sa pomocou Vite. Údaje o účtoch, rozpracovaných overeniach a reláciách ukladáme do PostgreSQL cez Prisma ORM 7.10.1. Šifrovacie operácie vykonáva kryptografický modul Node.js, heslá spracúva knižnica `argon2` a TOTP knižnica `otplib`. Výpočet TOTP sme neimplementovali nanovo.

Serverový kód sa nachádza v `apps/api/src`. Súbor `auth.service.ts` obsahuje registráciu, overenie faktorov a databázové transakcie; `auth.controller.ts` prijíma a kontroluje HTTP vstupy a `crypto.ts` šifruje TOTP tajomstvá. Schéma aj migrácia sú v `apps/api/prisma`. Používateľské rozhranie sa nachádza v `apps/web/src`; jeho stav rozlišuje registráciu, prihlásenie, voliteľnú aktiváciu TOTP a správu účtu. Súbor `packages/contracts/openapi.yaml` opisuje požiadavky a odpovede API.

Kontajnery definuje `compose.yaml`. Caddy prijíma HTTPS spojenia a podľa cesty odovzdáva požiadavky serveru alebo poskytuje zostavené webové súbory. Web a API tým používajú rovnaký origin, teda rovnakú schému, hostiteľa a port. Port API ani databázy nie je publikovaný na hostiteľskom počítači. Postup zostavenia, vytvorenia účtu a importu certifikátu uvádza [návod na lokálne testovanie](lan-test.md).

## Registrácia a aktivácia TOTP

Používateľ si vytvorí účet vo webovom formulári. Meno musí mať 3 až 64 znakov z množiny `a-z`, `0-9`, bodka, podčiarkovník a pomlčka; heslo má 8 až 128 znakov a formulár žiada jeho opätovné zadanie na potvrdenie. Server uloží Argon2id hash hesla s náhodnou soľou. Použité parametre sú 64 MiB pamäte, tri priechody a paralelizmus 1. Pri neexistujúcom mene sa vykoná overenie pomocného hashu, takže aj tento prípad spracuje Argon2id. Implementácia tým nezaručuje rovnaký čas každej chybnej odpovede.

Pri vytvorení účtu vznikne aj náhodné TOTP tajomstvo. Šifrujeme ho pomocou AES-256-GCM so samostatným kľúčom z konfigurácie. Pri každom šifrovaní používame nový 12-bajtový inicializačný vektor a 16-bajtový autentifikačný tag. Identifikátor účtu tvorí autentifikované sprievodné údaje, preto záznam prenesený k inému účtu pri dešifrovaní neprejde kontrolou integrity. Tento postup chráni tajomstvá pri samostatnom úniku databázy; kompromitovaný server s prístupom ku kľúču ich naďalej dokáže dešifrovať.

Nový účet dostane osemhodinovú reláciu a používateľ môže pokračovať bez TOTP. Aktiváciu spustí tlačidlom v účte; server až potom vydá QR kód alebo ručný kľúč. Pri prvom platnom TOTP kóde uloží aktiváciu a spotrebovaný časový krok. Ak je faktor aktívny, overenie hesla vytvorí päťminútovú rozpracovanú transakciu. Jej náhodný 256-bitový identifikátor pošle v cookie `__Host-bio_pending`; databáza uchová iba SHA-256 odtlačok. Cookie má atribúty Secure, HttpOnly a SameSite=Strict, cestu `/` a nemá atribút Domain.

QR sa vytvára lokálne bez externého generátora. Server vydá QR aj tajný kľúč iba prihlásenému účtu bez aktívneho TOTP. Po aktivácii ďalšiu požiadavku na vydanie tajomstva odmietne. Kým používateľ faktor nezapne, účet sa prihlasuje iba heslom.

## Dokončenie prihlásenia a ochrana pred opakovaním

TOTP používame so šiestimi číslicami, časovým krokom 30 sekúnd a toleranciou 30 sekúnd do minulosti aj budúcnosti. Princíp odvodenia kódu zdieľaným tajomstvom a časovým krokom definuje [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238.html). Synchronizácia času na serveri a telefóne je preto podmienkou úspešného overenia. TOTP kód prijatý mimo povoleného okna server odmietne.

Pred overením kódu zvýšime počítadlo pokusov mimo dokončovacej transakcie. Neúspešné overenie preto neobnoví už spotrebovaný pokus. Jedna rozpracovaná transakcia povoľuje najviac päť pokusov. Samostatný databázový limit povoľuje desať TOTP pokusov na účet počas päťminútového okna, takže vytvorenie novej transakcie tento limit neobíde. Pri hesle používame desať pokusov na používateľské meno a tridsať pokusov na IP adresu počas rovnakého okna.

Dokončenie prihlásenia vykonávame v krátkej databázovej transakcii. Najprv uzamkneme riadok účtu a opätovne skontrolujeme jeho politiku. Knižnica overí TOTP aj podmienku, že prijatý časový krok je novší než posledný spotrebovaný krok. Potom odstránime príslušnú rozpracovanú transakciu, uložíme nový krok a vytvoríme reláciu. Uzamknutie účtu serializuje dokončenia aj v prípade, keď dva prehliadače používajú rozdielne transakcie toho istého účtu.

Relácia má platnosť osem hodín bez priebežného predlžovania. Jej nový náhodný identifikátor sa prenáša v cookie `__Host-bio_session` s rovnakými ochrannými atribútmi ako rozpracované overenie. Existujúca relácia daného prehliadača sa pri ďalšom úplnom prihlásení odvolá. Odhlásenie odstráni príslušné serverové záznamy aj obe cookies. Pri čítaní relácie server kontroluje jej expiráciu a aktuálne povolenie režimu A.

## Kontrola požiadaviek a rozsah riešenia

Požiadavky, ktoré menia stav, musia obsahovať `Origin` zhodný s `APP_ORIGIN` a obsah typu `application/json`. Tým obmedzujeme podvrhnutie požiadavky z cudzej stránky, označované ako CSRF (Cross-Site Request Forgery). Vstupné meno, heslo a kód kontrolujeme pred ich spracovaním. Odpovede API obsahujú `Cache-Control: no-store`, aby sa údaje o aktivácii a prihlásení neukladali do bežnej HTTP vyrovnávacej pamäte.

Predpokladom dôvery v IP adresu klienta je nasadenie za jediným reverzným proxy Caddy. Pri samostatnom vystavení portu API treba túto konfiguráciu prehodnotiť. Registrácia je dostupná používateľom lokálnej siete a má limit požiadaviek podľa IP adresy. Obnova účtu, výmena alebo vypnutie aktívneho faktora a úplný trvalý audit zostávajú neimplementované. TOTP neposkytuje vlastnosti WebAuthn potrebné pre režimy B a C; tieto režimy nie je možné v prototype použiť. Účet bez aktívneho TOTP používa iba heslo, preto rozhranie odporúča faktor zapnúť.
