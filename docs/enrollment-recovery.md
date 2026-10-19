# Registrácia a obnova účtu

## Režim A

Používateľ si vytvorí účet zadaním jedinečného mena a hesla s dĺžkou 8 až 128 znakov. Formulár vyžaduje aj opätovné zadanie hesla; účet vytvorí iba vtedy, keď sa obe hodnoty zhodujú. Po registrácii sa otvorí relácia. TOTP môže zapnúť hneď alebo neskôr v nastaveniach účtu. Aktivácia sa dokončí až po zadaní prvého platného kódu. Server šifruje tajomstvo a obsah QR kódu nezapisuje do logov. Po aktivácii vyžaduje TOTP pri každom novom prihlásení.

## Párovanie zariadení

Režim B registruje a následne overuje kandidátsky YubiKey v čerstvo overenej relácii. Režim C vyžaduje objaviteľné prihlasovacie údaje a príznak overenia používateľa. Telefón sa páruje krátkodobou požiadavkou po silnom overení účtu. Server uloží verejný mobilný kľúč vo väzbe na účet. Zmena biometrického zápisu môže zneplatniť súkromný kľúč a vyžadovať nové párovanie.

## Obnova

Obnova TOTP účtu a výmena alebo vypnutie aktívneho faktora zatiaľ nie sú implementované. B/C podporujú odvolanie kľúča alebo zariadenia a dotknutých relácií s auditom. Administrátorský príkaz block-user účet bezpečne zablokuje bez zmeny politiky. Nový enrollment po strate všetkých faktorov vyžaduje kontrolovaný administrátorský postup; automatické odblokovanie nie je implementované. Podrobnosti uvádza modes-b-c.md. Automatické obnovenie režimu C iba cez e-mail nie je povolené.
