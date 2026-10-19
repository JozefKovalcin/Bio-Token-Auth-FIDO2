# Kontrakt API

Súbor `openapi.yaml` opisuje HTTP požiadavky a odpovede A/B/C, WebAuthn enrollment, účelové grants, správu faktorov/politiky a cookie-free mobilné operácie. Slúži ako rozhranie medzi webom, API a Kotlin DTO. Validácia: `pnpm check:contract`. Kotlin serializáciu a podpisové fixtures overuje samostatný Android build.

Kontrakt nesmie prenášať súkromné kľúče, biometrické šablóny, heslá v odpovediach ani TOTP tajomstvá po aktivácii faktora.
