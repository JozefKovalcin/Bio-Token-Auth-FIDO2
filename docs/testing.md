# Etapy a overovanie

1. Základ repozitára a dokumentácia (tento scaffold).
2. TypeScript workspace, NestJS/React, Prisma migrácie, lokálny PostgreSQL.
3. Režimy A/B a WebAuthn registrácia C.
4. Android enrollment a biometricky autorizovaný podpis.
5. QR transakcie, dokončenie session a správa zariadení.
6. Bezpečnostné testy a fyzické overenie.

Automatické testy: nesprávny origin/RP ID/podpis; chýbajúci UP/UV; expirovaná challenge; zámenné účty/transakcie; replay; súbežné dokončenie; odvolané zariadenie; obídenie režimu; TOTP replay a pokusy; session fixation.

Manuálne: YubiKey 5C NFC cez USB na cieľovom PC, správny/nesprávny PIN, zrušené dialógy, QR na reálnom telefóne, odtlačok a zamietnutie, zmena biometrie, strata siete, expirácia. Zaznamenať model, firmware, OS a prehliadač.

Merania: čas a úspešnosť prihlásenia, počet interakcií, používateľská zrozumiteľnosť a rozdiely A/B/C. FAR/FRR vlastného biometrického algoritmu sa nemerajú, pretože projekt používa systémovú biometriu.
