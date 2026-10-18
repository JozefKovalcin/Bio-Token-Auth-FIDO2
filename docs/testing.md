# Etapy a testovanie

Režim A a konfigurácia zabezpečeného prenosu HTTPS (Hypertext Transfer Protocol Secure) sú implementované. Automatické kontroly spustíte podľa [návodu na test v lokálnej sieti](lan-test.md); ich výsledky a rozsah uvádza [záznam overenia](verification.md). Režimy B a C a klient pre Android sú plánované etapy.

## Implementovaný režim A

Integračné testy overujú vytvorenie účtu, jedinečnosť mena, pravidlá hesla, prihlásenie pred aktiváciou časovo odvodeného jednorazového hesla TOTP (Time-Based One-Time Password), aktiváciu a následné overenie tohto faktora. Ďalej kontrolujú obmedzenie pokusov, expiráciu, pôvod požiadaviek, cookies, súbežné dokončenie a opakované použitie kódu. Samostatný HTTPS test kontroluje certifikačný reťazec, IP adresu certifikátu, web, API, politiku `Origin`, hlavičku CSP (Content Security Policy) a presmerovanie z HTTP.

## Plánované overenie režimov B a C

Pred implementáciou treba pripraviť testy nesprávneho originu alebo identifikátora RP (Relying Party ID), neplatného podpisu, chýbajúcich príznakov prítomnosti či overenia používateľa, exspirovanej výzvy, zámeny účtu alebo transakcie, opakovania výzvy a súbežného dokončenia. Server musí tiež odmietnuť prihlásenie, ktoré obchádza povinný režim účtu.

Manuálne overenie bude vyžadovať podporovaný YubiKey a Android telefón. Zaznamenáme model kľúča, firmware, verziu systému a prehliadač. Testy pokryjú správny aj nesprávny PIN, zrušené výzvy, odmietnutú alebo potvrdenú biometriu, zmenu biometrického zápisu, výpadok siete a expiráciu transakcie.

Výkonnostné merania majú porovnať čas a úspešnosť prihlásenia, počet úkonov používateľa a zrozumiteľnosť jednotlivých režimov. Projekt nepoužíva vlastný biometrický algoritmus, preto nemeria jeho FAR ani FRR.
