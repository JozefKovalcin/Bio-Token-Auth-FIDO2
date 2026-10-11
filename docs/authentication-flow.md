# Prihlasovací tok

## A: heslo a TOTP

Overenie mena/hesla → pending transakcia → TOTP → session. Obmedzte pokusy a časové okno; rovnaký TOTP timestep nesmie byť znovu prijatý pre účet.

## B: heslo a YubiKey

Overenie mena/hesla → výzva pre zaregistrované non-discoverable credentials → WebAuthn verification → session. Pri registrácii nevyžadujte resident key. Ak je striktne vyžadovaný YubiKey, nastavte politiku trusted attestation; USB hint sám nepreukazuje model kľúča.

## C: YubiKey a Android

1. Prehliadač vytvorí pending reláciu a požiada o WebAuthn bez vopred zadaného účtu.
2. YubiKey odpovie discoverable credential; server overí podpis, UP/UV, challenge, RP ID, origin a identitu účtu.
3. Server vytvorí mobilnú výzvu s predvolenou platnosťou 120 sekúnd. QR obsahuje jednorazový náhodný opaque identifikátor, nie session cookie.
4. Mobil načíta transakciu, zobrazí službu/účet a vyžiada explicitné schválenie.
5. BIOMETRIC_STRONG cez CryptoObject autorizuje podpis kanonickej serverovej výzvy. Podpis je viazaný na účel, transakciu, účet, expiráciu a nonce.
6. Backend overí verejný kľúč spárovaného aktívneho zariadenia toho istého účtu a jednorazovo schváli transakciu.
7. Pôvodný prehliadač transakciu atomicky spotrebuje a dostane novú session cookie; pending session sa zruší.

Stavy: PENDING_YUBIKEY → PENDING_MOBILE → APPROVED → CONSUMED. Koncové alternatívy: EXPIRED, REJECTED, CANCELLED. Stavové endpointy sú dostupné iba držiteľovi príslušnej pending relácie; QR sa neloguje.
