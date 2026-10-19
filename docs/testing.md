# Testovanie a hranice overenia

Automatické kontroly A/B/C, webu, Android klienta a atestačného verifiera sa vykonávajú oddelene. Aktuálne výsledky sú v [zázname overenia](verification.md). Fyzický akceptačný protokol je v [návode B/C](modes-b-c.md).

## Server a web

`pnpm build`, `pnpm check` a `pnpm check:contract` overujú zostavenie, TypeScript a OpenAPI. Integračné testy spúšťa izolovaný `compose.test.yaml` so skutočným PostgreSQL; názov ručne zadanej testovacej databázy musí končiť `_test`. Testy nikdy nespúšťajte na prevádzkovej DB.

Testy A pokrývajú registráciu/TOTP, limity, replay, expiráciu, cookies a súbežné dokončenie. Testy B používajú skutočné EC podpisy a SimpleWebAuthn assertion verifier na overenie originu, RP ID, challenge, typu, UP/UV, mapovania účtu a counter súbehu. Registračný trust boundary je v orchestration testoch nahradený výslovne testovým adapterom; to nepotvrdzuje skutočnú YubiKey atestáciu. Skutočný registračný adapter odmieta none/self attestation.

C testy overujú JWS bajty, oddelenie účelov/kľúčov, kandidátske párovanie, kontrolu pôvodného PC, dva faktory, replay, expiráciu, revokáciu, zmenu trust stavu a súbežné rozhodnutie/dokončenie. Ich atestačný fixture provider existuje iba v testoch. HTTP testy overujú oddelenie native a browser rout, Origin, cookies a veľkosť/validitu JSON bez úniku obsahu.

`pnpm test:browser` používa Chromium a virtuálny WebAuthn autentifikátor. API je v týchto UI testoch nahradené testovou hranicou; testuje sa správanie formulárov, skutočné browserové vytvorenie assertion, odmietnutie fallbacku a stale-tab handling. Nejde o fyzický hardvérový test.

## Android

Príkazy sú v [Android README](../apps/android/README.md): `spotlessCheck`, `:core:test`, `:app:testDebugUnitTest`, `:app:lintDebug`, `:app:assembleDebug`, `:app:assembleDebugAndroidTest`. Kotlin/Node fixture overuje rovnaké JWS bajty; JVM testy kontrolujú kontrakt, QR, TLS, stav, výslovný súhlas a staré callbacky.

Device testy sú samostatné. CI emulator job cielene spúšťa Compose UI test; nepredstiera biometrickú hardvérovú atestáciu. `DeviceKeysTest` vyžaduje dostupnú a zapísanú silnú biometriu a inak test preskočí; jeho preskočenie nikdy nie je úspešná hardvérová akceptácia. Screenshot/bencmark tasky zatiaľ nie sú zavedené.

## Atestačný verifier

`docker build -t bio-attestation-check infra/attestation` zostaví oficiálnu pripnutú Android knižnicu a vykoná JVM policy testy. `node tests/attestation-smoke.mjs` overí health, internú autorizáciu a odmietnutie chybnej atestácie/trust evidence v jednorazovom kontajneri. Skutočná úspešná atestácia vyžaduje podporovaný fyzický telefón a správnu identitu APK.

## Fyzické a výkonnostné overenie

Fyzické B/C testy zaznamenajú model/firmware YubiKey, PC/browser, Android model/verziu a podpis APK. Pokryjú správny/chybný PIN, dotyk/zrušenie, odtlačok, lockout bez PIN fallbacku, zmenu biometrického zápisu, revokáciu, výpadok siete a expiráciu. C sa dokončí iba na pôvodnom PC po oboch faktoroch toho istého účtu.

Časy a spoľahlivosť sa merajú na reálnych zariadeniach. Projekt neimplementuje biometrický algoritmus, preto nemeria jeho FAR/FRR. QR tok neposkytuje dôkaz fyzickej blízkosti.
