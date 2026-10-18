# Webové rozhranie

Rozhranie používa React, TypeScript a Vite. Prihlasovací tok obsahuje registráciu, zadanie hesla, nastavenie a zadanie TOTP a zobrazenie účtu. Klient považuje prihlásenie za úspešné až po odpovedi API.

Používateľ si vyžiada QR kód pri zapnutí TOTP. Kým nepotvrdí prvý platný kód, faktor sa nepovažuje za aktívny. Po aktivácii sa tajomstvo znovu nezobrazuje. Ak používateľ nastavuje autentifikátor na tom istom telefóne, môže použiť zobrazený ručný kľúč; QR kód možno naskenovať z obrazovky iného zariadenia.

Stránka obsahuje manifest a ikony pre pridanie na plochu. Prihlasovanie vyžaduje spojenie so serverom a offline režim nie je implementovaný. Caddy poskytuje webové súbory a smeruje API požiadavky na rovnakom origine. Postup spustenia uvádza [návod na LAN test](../../docs/lan-test.md).
