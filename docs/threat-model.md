# Model hrozieb

Chránené aktíva: účet, pending/web session, TOTP tajomstvo, verejné väzby zariadení a ich integrita.

| Hrozba | Kontrola |
| --- | --- |
| Replay | Jednorazový nonce, expirácia, atomická spotreba |
| Zámena účtu alebo QR | Väzba transakcie na účet, pôvodnú reláciu a mobilný verejný kľúč |
| Obídenie silnejšieho režimu | Serverová politika a stavový automat |
| QR phishing/relay | Kontrola služby a požiadavky na mobile; neprehlasovať vlastný QR tok za dôkaz fyzickej blízkosti |
| Session fixation / CSRF | Rotácia session po úspechu, Secure/HttpOnly/SameSite, CSRF/origin kontroly |
| Brute force | Limity pokusov a audit pre heslá, TOTP a pending požiadavky |
| Podvrhnutý biometrický callback | Biometricky autorizovaný podpis; validácia enrollmentu a podľa politiky attestation |
| Únik databázy | Argon2id, šifrovanie TOTP oddeleným kľúčom, minimum uložených dát |
| Krádež zariadenia | PIN kľúča, biometria telefónu, odvolanie zariadení a session |

Vlastný QR tok na internete nemá Bluetooth kontrolu blízkosti ako WebAuthn hybrid. YubiKey krok má phishing-resistant vlastnosti WebAuthn, no celý vlastný schvaľovací tok treba posudzovať samostatne. Rootovaný/kompromitovaný telefón a PC sú významné limity modelu dôvery.
