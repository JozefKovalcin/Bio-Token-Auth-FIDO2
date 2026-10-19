# Webové rozhranie

Rozhranie používa React, TypeScript a Vite. Prihlasovací tok obsahuje registráciu, zadanie hesla, nastavenie a zadanie TOTP a zobrazenie účtu. Klient považuje prihlásenie za úspešné až po odpovedi API.

`AdvancedLogin.tsx` obsluhuje B a C, `SecurityPanel.tsx` registráciu/overenie kandidátskeho kľúča, párovanie telefónu a zmenu politiky. Dostupnosť B/C určuje server. WebAuthn sa spúšťa po používateľskej akcii; zlyhanie neprepne automaticky na slabší režim. C polling kontroluje aj očakávané verejné ID transakcie, aby stará karta nespotrebovala nový flow v rovnakom cookie jar.

Používateľ si vyžiada QR kód pri zapnutí TOTP. Kým nepotvrdí prvý platný kód, faktor sa nepovažuje za aktívny. Po aktivácii sa tajomstvo znovu nezobrazuje. Ak používateľ nastavuje autentifikátor na tom istom telefóne, môže použiť zobrazený ručný kľúč; QR kód možno naskenovať z obrazovky iného zariadenia.

Stránka obsahuje manifest a ikony pre pridanie na plochu. Prihlasovanie vyžaduje spojenie so serverom a offline režim nie je implementovaný. Caddy poskytuje webové súbory a smeruje API požiadavky na rovnakom origine. Postup spustenia uvádza [návod na LAN test](../../docs/lan-test.md).
