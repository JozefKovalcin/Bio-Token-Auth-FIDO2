# Rozhodnutie: spoločný bezpečnostný základ režimov B a C

Dátum: 19. októbra 2026. Stav: implementované rozhrania a pravidlá; fyzické akceptačné overenie zostáva samostatnou podmienkou zapnutia.

Používame lokálny Docker Compose, Caddy a PostgreSQL. Režimy B/C potrebujú stabilné DNS meno dostupné z PC aj telefónu a dôveryhodné HTTPS. Navrhovaný názov pre LAN je `auth.bio-token.test`; konkrétne DNS záznamy nastavuje správca siete. RP ID je konfigurované serverom a nemení sa podľa hlavičky Host. Existujúce A nasadenie cez IP môže pokračovať s vypnutým WebAuthn.

Režim B používa non-discoverable registračný profil a meno/heslo pred assertion. Režim C používa samostatný discoverable profil, rozpoznanie účtu cez serverový credential/userHandle mapping a mobilný podpis. Pre oba profily požadujeme UP aj UV. `residentKey: discouraged` je preferencia API; podporovaný fyzický YubiKey sa musí overiť manuálne. USB hint sám nedokazuje transport ani výrobcu.

YubiKey-only profil vyžaduje overenú packed atestáciu, dôveryhodný koreň a explicitný AAGUID allowlist. WebAuthn je predvolene vypnutý, kým správca tieto vstupy nedodá. Neúspešná validácia nemá fallback na ľubovoľný autentifikátor. Používame SimpleWebAuthn, nie vlastný WebAuthn protokol.

Zachovávame opaque host-only cookies pre session a pending oprávnenie. Session eviduje režim, faktorové dôkazy, čas, credential/device a bezpečnostnú verziu účtu. Migrácia odvolá historické session bez týchto dôkazov. Účelové jednorazové grants autorizujú enrollment, odvolanie a zmenu politiky. Nová konfigurácia faktorov nepovyšuje historické session.

Mobilný klient používa dva Keystore kľúče: device-auth pre účelovo viazané jednorazové request dôkazy a approval kľúč pre podpis autorizovaný pri každom použití silnou biometriou. Approval nepovoľuje PIN fallback. Podpisuje celý štandardný JWS ES256 Signing Input pomocou autorizovaného CryptoObject; platformová a JOSE knižnica vykonávajú kryptografiu a konverziu kódovania. QR obsahuje iba krátkodobú capability, nie webovú session.

Interný JVM atestačný verifier používa pripnutý zdroj knižnice Android Key Attestation. Overuje dôveru, revokácie, challenge, aplikáciu a požadované hardvérové vlastnosti. Má samostatný interný bearer secret a žiadny publikovaný port. API nikdy neakceptuje klientský boolean o hardvéri alebo biometrii. Režim C je predvolene vypnutý a vyžaduje aj výslovne zaznamenané fyzické overenie.

Párovanie vyžaduje čerstvé overenie účtu, C YubiKey proof, atestáciu a dôkaz držby mobilných kľúčov a potvrdenie konkrétneho kandidáta na pôvodnom PC. Už existujúca C politika vyžaduje na správu faktorov C. Pri zmene politiky a odvolaní faktorov sa odvolajú dotknuté session/transakcie. Obnova nikdy automaticky nezapne slabší režim.

Overovanie kryptografie a sieťový kontakt atestačného verifiera prebiehajú mimo DB transakcií. Dokončenie používa krátke transakcie, konzistentný zámok účtu a podmienené verzie. Aktualizácia credential counteru, spotreba výzvy a vydanie session sú atomické. Native routy majú vlastnú kryptografickú autorizáciu; browserové routy zachovávajú Origin/JSON/CSRF ochranu.

Automatické testy protokolu, virtuálny autentifikátor a testové trust fixtures sú dôkaz softvérového správania. Nenahrádzajú fyzický YubiKey, Android biometriu a reálnu atestáciu.
