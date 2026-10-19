# Testovanie

Pozri docs/testing.md a docs/verification.md. Použiť najnižšiu vrstvu dokazujúcu acceptance kritérium. Backend integračné testy používajú skutočný PostgreSQL; WebAuthn assertion verifikáciu skutočnú knižnicu. Testový registration/attestation provider zostáva iba testovou hranicou a nepotvrdzuje fyzické MFA.

Android :core:test pokrýva kontrakt, QR/origin, TLS a JOSE/Node fixtures. :app:testDebugUnitTest pokrýva state holder a staré callbacky. :app:lintDebug, assembleDebug a assembleDebugAndroidTest sú reálne tasky. UI/device výsledky odlišovať od JVM testov; biometria, Keystore, zmena zápisu a atestácia vyžadujú fyzický telefón. Príkazy sú v reference/commands.md. Screenshot a benchmark tasky nie sú zavedené.
