# Model hrozieb

Model pokrýva softvérovú implementáciu A/B/C. Fyzické overenie YubiKey/Android zatiaľ nie je potvrdené; konfigurácia a hranice sú v modes-b-c.md.

| Hrozba | Kontrola | Stav |
| --- | --- | --- |
| Opakované použitie TOTP | Server prijme časový krok iba raz a dokončenie vykoná atomicky. | Režim A |
| Zámena účtu alebo QR požiadavky | Transakcia sa viaže na účet, pôvodnú reláciu a mobilný verejný kľúč. | Implementácia C; fyzické overenie čaká |
| Obídenie povinného režimu | Dostupné režimy určuje serverová politika účtu. | Serverová politika a integračné testy A/B/C |
| QR phishing alebo relay útok | Telefón zobrazí službu a účet; QR tok nedokazuje fyzickú blízkosť. | Implementácia C; fyzické overenie čaká |
| Fixácia relácie alebo falšovanie požiadaviek medzi webmi (CSRF, Cross-Site Request Forgery) | Po úspešnom prihlásení sa mení identifikátor relácie; cookies používajú Secure, HttpOnly a SameSite=Strict a API kontroluje `Origin`. | Režim A |
| Hádanie hesiel alebo kódov | Limity požiadaviek na účet a adresu internetového protokolu (IP, Internet Protocol) obmedzujú počet pokusov. | Režim A |
| Podvrhnutý výsledok biometrie | Server overí podpis vytvorený kľúčom autorizovaným systémovou biometriou. | Implementácia C; fyzické overenie čaká |
| Únik databázy | Heslá sa hashujú pomocou Argon2id a TOTP tajomstvá sa šifrujú oddeleným kľúčom. | Režim A |
| Strata kľúča alebo telefónu | Zariadenie a jeho relácie možno odvolať; obnova vyžaduje kontrolovaný proces. | Odvolanie/audit/zablokovanie implementované; automatická obnova nie je dostupná |

QR tok pre režim C nemá mechanizmus blízkosti porovnateľný s WebAuthn hybridným tokom. Kľúč YubiKey môže poskytnúť ochranu WebAuthn proti phishingu, no schvaľovanie cez QR sa musí posudzovať samostatne. Kompromitovaný operačný systém telefónu alebo počítača zostáva mimo ochrany tejto aplikácie.
