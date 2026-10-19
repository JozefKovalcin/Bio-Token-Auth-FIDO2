# Príkazy

Z koreňa projektu: `pnpm build`, `pnpm check`, `pnpm check:contract`, `pnpm test:browser`.
API/DB testy: `docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests`, potom `docker compose -f compose.test.yaml down`. Používať iba izolovanú testovaciu DB.

Android (JDK17 + SDK35): z apps/android spustiť `./gradlew.bat spotlessCheck :core:test :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest -PbioServiceOrigin=https://auth.bio-token.test`. Na Linuxe `bash ./gradlew` s rovnakými taskmi. Skript apps/android/scripts/Verify-Android.ps1 používa tieto reálne tasky. `spotlessApply` formátuje, nevypína kontroly.

Device UI: `:app:connectedDebugAndroidTest` potrebuje pripojené zariadenie/emulátor. CI spúšťa na emulátore výslovne ApprovalScreenTest. DeviceKeysTest vyžaduje zapísanú silnú biometriu; preskočenie nie je dôkaz hardvérového MFA. Fyzické B/C akceptačné testy sú oddelené v docs/modes-b-c.md.

Verifier: `docker build -t bio-attestation-check infra/attestation`, potom `node tests/attestation-smoke.mjs`.

Detekt, screenshot matrice, benchmarky, Makefile ani upstream generátor nie sú zavedené. Nepoužívať neexistujúce `make verify`, `make docs-check`, `make device-test-ci` či `bash scripts/add-module.sh`. Kontroly diffu: `git diff --check` a `git status --short`.
