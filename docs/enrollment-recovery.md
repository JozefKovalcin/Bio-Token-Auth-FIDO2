# Registrácia a obnova účtu

## Režim A

Používateľ si vytvorí účet zadaním jedinečného mena a hesla s dĺžkou 8 až 128 znakov. Formulár vyžaduje aj opätovné zadanie hesla; účet vytvorí iba vtedy, keď sa obe hodnoty zhodujú. Po registrácii sa otvorí relácia. TOTP môže zapnúť hneď alebo neskôr v nastaveniach účtu. Aktivácia sa dokončí až po zadaní prvého platného kódu. Server šifruje tajomstvo a obsah QR kódu nezapisuje do logov. Po aktivácii vyžaduje TOTP pri každom novom prihlásení.

## Plánované párovanie zariadení

Režim B má registrovať kľúč YubiKey v overenej relácii. Režim C vyžaduje objaviteľné prihlasovacie údaje a príznak overenia používateľa. Telefón sa páruje krátkodobou požiadavkou po silnom overení účtu. Server uloží verejný mobilný kľúč vo väzbe na účet. Zmena biometrického zápisu môže zneplatniť súkromný kľúč a vyžadovať nové párovanie.

## Obnova

Obnova TOTP účtu a výmena alebo vypnutie aktívneho faktora zatiaľ nie sú implementované. Návrh pre režimy B/C počíta s odvolaním strateného kľúča alebo zariadenia a dotknutých relácií. Pred nasadením treba určiť kontrolovaný proces obnovy a auditovať jeho použitie. Automatické obnovenie režimu C iba cez e-mail nie je povolené.
