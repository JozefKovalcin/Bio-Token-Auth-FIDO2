# Architektúra

PC prehliadač komunikuje s NestJS cez HTTPS a s YubiKey prostredníctvom WebAuthn. Android komunikuje s tým istým backendom cez HTTPS; NFC sa nepoužíva. Backend spravuje účty, verejné kľúče, výzvy a session v PostgreSQL.

WebAuthn discoverable credential režimu C identifikuje účet. PIN YubiKey nenahrádza biometria telefónu. Samotné vloženie kľúča nestačí a aplikácia nedohliada priebežne na USB prítomnosť.

Biometrické údaje zostávajú na telefóne. Server overuje podpis, nie odtlačok. Model dôvery zahŕňa OS telefónu a autorizáciu Keystore kľúča; pre silnejšie tvrdenia o hardware je potrebná validovaná key attestation a politika registrácie.

Voľba: jeden repozitár, samostatné aplikácie. TypeScript workspace pre web/API/kontrakty, samostatný Gradle build Androidu. Supabase hosting sa nevyžaduje; PostgreSQL skill poskytuje odporúčania aj pre vlastnú databázu.
