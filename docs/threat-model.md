# Model hrozieb

Model pokrýva implementovaný režim A a návrh režimov B/C. Tabuľka uvádza, ktoré kontroly sú súčasťou aplikácie a ktoré treba doplniť pred implementáciou ďalších režimov.

| Hrozba | Kontrola | Stav |
| --- | --- | --- |
| Opakované použitie TOTP | Server prijme časový krok iba raz a dokončenie vykoná atomicky. | Režim A |
| Zámena účtu alebo QR požiadavky | Transakcia sa viaže na účet, pôvodnú reláciu a mobilný verejný kľúč. | Plánované pre C |
| Obídenie povinného režimu | Dostupné režimy určuje serverová politika účtu. | Pravidlo je zdokumentované; B/C nie sú implementované |
| QR phishing alebo relay útok | Telefón zobrazí službu a účet; QR tok nedokazuje fyzickú blízkosť. | Plánované pre C |
| Fixácia relácie alebo falšovanie požiadaviek medzi webmi (CSRF, Cross-Site Request Forgery) | Po úspešnom prihlásení sa mení identifikátor relácie; cookies používajú Secure, HttpOnly a SameSite=Strict a API kontroluje `Origin`. | Režim A |
| Hádanie hesiel alebo kódov | Limity požiadaviek na účet a adresu internetového protokolu (IP, Internet Protocol) obmedzujú počet pokusov. | Režim A |
| Podvrhnutý výsledok biometrie | Server overí podpis vytvorený kľúčom autorizovaným systémovou biometriou. | Plánované pre C |
| Únik databázy | Heslá sa hashujú pomocou Argon2id a TOTP tajomstvá sa šifrujú oddeleným kľúčom. | Režim A |
| Strata kľúča alebo telefónu | Zariadenie a jeho relácie možno odvolať; obnova vyžaduje kontrolovaný proces. | Plánované; obnova nie je implementovaná |

QR tok pre režim C nemá mechanizmus blízkosti porovnateľný s WebAuthn hybridným tokom. Kľúč YubiKey môže poskytnúť ochranu WebAuthn proti phishingu, no schvaľovanie cez QR sa musí posudzovať samostatne. Kompromitovaný operačný systém telefónu alebo počítača zostáva mimo ochrany tejto aplikácie.
