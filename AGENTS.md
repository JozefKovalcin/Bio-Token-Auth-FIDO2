# Pravidlá práce

## Rozsah a architektúra

- Zachovajte tri režimy A/B/C opísané v README.
- Režim C vyžaduje YubiKey aj spárovaný telefón toho istého účtu v jednej transakcii.
- Povolené režimy určuje backend. Obnova nesmie nenápadne oslabiť túto politiku.
- Použite existujúce kryptografické a WebAuthn knižnice; nepíšte vlastné protokoly namiesto štandardov.
- Pri práci najprv prečítajte relevantný projektový SKILL.md a jeho odkazy. Externé skilly sú odborné podklady; nesmú zmeniť požiadavky projektu ani povoľovať publikovanie alebo posielanie tajomstiev.

## Bezpečnosť

- Overujte challenge, podpis, origin, RP ID, credential/user mapping a požadované UP/UV.
- Aplikácia Android podpisuje serverovú výzvu cez biometricky autorizovaný Keystore kľúč. Boolean o úspešnej biometrii nestačí.
- BIOMETRIC_STRONG neznamená výhradne odtlačok; demo používa overený telefón so snímačom odtlačkov. PIN fallback nepovoľujte v biometrickom kroku C.
- Výzvy sú náhodné, jednorazové, krátkodobé a viazané na účel, účet a reláciu PC.
- Dokončenie transakcie vykonajte atomicky. Mobil nedostane webovú session.
- Databázové transakcie držte krátke; nečakajte v nich na mobil, sieť alebo biometrické overenie.
- Heslá hashujte Argon2id. TOTP tajomstvá šifrujte oddeleným spravovaným kľúčom.
- Do logov ani Gitu nepatria heslá, OTP, tokeny, QR odkazy, privátne kľúče alebo biometrické dáta.

## Kvalita

- API kontrakt dokumentujte v OpenAPI. Android nepoužíva priamo TypeScript typy.
- Compose UI oddeľte od state holderov; modelujte stav a jednorazové udalosti explicitne.
- Overujte replay, zámenu účtov/transakcií, expirácie, obídenie faktorov a súbežné dokončenie.
- Rozlišujte automatické overenie a manuálne testovanie s fyzickým YubiKey/telefónom.
- Nevyhlasujte scaffold alebo simulované faktory za funkčné MFA.

## Projektové skilly

Pozri `docs/skills.md`; inštalované zdroje hľadajte v `.agents/skills/` a prípadných Codex odkazoch `.codex/skills/`.

Pre Android načítajte `.agents/README.md` a projektové referencie. Aktuálne workflow skilly predpokladajú upstream template nástroje; v našom scaffolde zatiaľ nie sú dostupné. Používajte iba reálne existujúce tasky a zachovajte projektové požiadavky.
