# Registrácia a obnova

Bootstrap účtu je samostatný proces. Pre prototyp použite kontrolovanú administrátorskú registráciu; verejný onboarding ešte nie je navrhnutý.

YubiKey sa registruje do autentifikovanej enrollment relácie. Pre C vyžadujte residentKey=required a userVerification=required. Pre B registrujte samostatný non-discoverable credential.

Telefón sa páruje krátkodobou požiadavkou po silnom overení účtu. Server viaže verejný mobilný kľúč na účet; pripojenie zariadenia vyžaduje potvrdenie pôvodného procesu. Zmena biometrie môže zneplatniť kľúč a vyžaduje nové párovanie.

TOTP sa aktivuje až po potvrdení prvého kódu. Tajomstvo sa šifruje; QR sa nezapisuje do logov.

Strata zariadenia: odvolať credential/zariadenie a existujúce relácie, auditovať udalosť. Uprednostnite záložný zaregistrovaný kľúč a kontrolovaný proces obnovy. Automatický email-only fallback do režimu C nie je povolený. Presná obnova je otvorené rozhodnutie pred produkčným nasadením.
