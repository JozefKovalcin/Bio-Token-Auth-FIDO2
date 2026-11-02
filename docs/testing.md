# Testovanie a hranice overenia

Automatické kontroly A/B/C, webu, Android klienta a atestačného verifiera sa vykonávajú oddelene. Aktuálne výsledky sú v [zázname overenia](verification.md). Fyzický akceptačný protokol je v [návode B/C](modes-b-c.md).

## Server a web

`pnpm build`, `pnpm check` a `pnpm check:contract` overujú zostavenie, TypeScript a OpenAPI. Integračné testy spúšťa izolovaný `compose.test.yaml` so skutočným PostgreSQL; názov ručne zadanej testovacej databázy musí končiť `_test`. Testy nikdy nespúšťajte na prevádzkovej DB.

Testy A pokrývajú registráciu/TOTP, limity, replay, expiráciu, cookies a súbežné dokončenie. Testy B používajú skutočné EC podpisy a SimpleWebAuthn assertion verifier na overenie originu, RP ID, challenge, typu, UP/UV, mapovania účtu a counter súbehu. Registračný trust boundary je v orchestration testoch nahradený výslovne testovým adapterom; to nepotvrdzuje skutočnú YubiKey atestáciu. Skutočný registračný adapter odmieta none/self attestation.

C testy overujú JWS bajty, oddelenie účelov/kľúčov, kandidátske párovanie, kontrolu pôvodného PC, dva faktory, replay, expiráciu, revokáciu, zmenu trust stavu a súbežné rozhodnutie/dokončenie. Ich atestačný fixture provider existuje iba v testoch. HTTP testy overujú oddelenie native a browser rout, Origin, cookies a veľkosť/validitu JSON bez úniku obsahu.

Status zariadenia má regresie pre bezpečné odvolanie expirovaného/zrušeného kandidáta, ochranu aktívneho telefónu, jednorazovosť dôkazu a súbeh s potvrdením/revokáciou. `tests/mobile-attestation.test.ts` overuje skutočné streamové limity odpovedí interného verifiera v bajtoch, nedôveryhodnú `Content-Length`, chybnú evidence, sanitizáciu a revokačnú cache; fetch je tu testová hranica, nie fyzická atestácia.

Regresné testy dopĺňania issuerov vytvárajú dočasnú testovaciu PKI a skutočne podpísanú packed atestáciu cez OpenSSL; lokálny `pnpm test` preto potrebuje aj CLI `openssl` v PATH (Compose test image ho obsahuje). Súkromné testovacie kľúče sa generujú iba v dočasnom priečinku a následne odstránia, nie sú súčasťou Gitu ani runtime konfigurácie. Overuje sa odmietnutie leaf-only reťazca bez poolu, úspech s explicitnými intermediates pod pôvodným rootom, nezmenené podpísané bajty a odmietnutie nesprávnych rootov/issuerov, podpisov, payloadu, UP/UV a chybných poolov. Ani tento kryptografický fixture nenahrádza fyzický YubiKey.

`pnpm test:browser` používa Chromium a virtuálny WebAuthn autentifikátor. API je v týchto UI testoch nahradené testovou hranicou; testuje sa správanie formulárov, skutočné browserové vytvorenie assertion, odmietnutie fallbacku a stale-tab handling. Nejde o fyzický hardvérový test.

Browserová regresia C párovania posunie kontrolovaný čas po zobrazení kandidáta: expirovaný formulár a kód zmiznú bez potvrdenia, nové párovanie je opäť dostupné.

## Android

Príkazy sú v [Android README](../apps/android/README.md): `spotlessCheck`, `:core:test`, `:app:testDebugUnitTest`, `:app:lintDebug`, `:app:assembleDebug`, `:app:assembleDebugAndroidTest`. Kotlin/Node fixture overuje rovnaké JWS bajty; JVM testy kontrolujú kontrakt, QR, TLS, stav, výslovný súhlas a staré callbacky.

Kontrola spojenia má lokálne TLS testy pre neznámu CA a nesprávny hostname bez obídenia validácie, zakázané redirecty/cookies/autorizáciu, bounded odpoveď a pevné sieťové klasifikácie. State holder testy odlišujú diagnostiku od C autentifikácie, chránia uložené kľúče pri expirácii a povoľujú ich odstránenie až po autorizovanom `REVOKED`. Oneskorený biometrický callback po expirácii nesmie odoslať dôkaz.

Device testy sú samostatné. CI emulator job cielene spúšťa Compose UI test; nepredstiera biometrickú hardvérovú atestáciu. `DeviceKeysTest` vyžaduje dostupnú a zapísanú silnú biometriu a inak test preskočí; jeho preskočenie nikdy nie je úspešná hardvérová akceptácia. Screenshot/bencmark tasky zatiaľ nie sú zavedené.

## Atestačný verifier

`docker build -t bio-attestation-check infra/attestation` zostaví oficiálnu pripnutú Android knižnicu a vykoná JVM policy testy. `node tests/attestation-smoke.mjs` overí health, internú autorizáciu a odmietnutie chybnej atestácie/trust evidence v jednorazovom kontajneri. Skutočná úspešná atestácia vyžaduje podporovaný fyzický telefón a správnu identitu APK.

## Fyzické a výkonnostné overenie

Fyzické B/C testy zaznamenajú model/firmware YubiKey, PC/browser, Android model/verziu a podpis APK. Pokryjú správny/chybný PIN, dotyk/zrušenie, odtlačok, lockout bez PIN fallbacku, zmenu biometrického zápisu, revokáciu, výpadok siete a expiráciu. C sa dokončí iba na pôvodnom PC po oboch faktoroch toho istého účtu.

Časy a spoľahlivosť sa merajú na reálnych zariadeniach. Projekt neimplementuje biometrický algoritmus, preto nemeria jeho FAR/FRR. QR tok neposkytuje dôkaz fyzickej blízkosti.
