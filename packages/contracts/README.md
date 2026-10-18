# Kontrakt API

Súbor `openapi.yaml` opisuje HTTP požiadavky a odpovede implementovaného režimu A. Slúži ako rozhranie medzi webovým klientom a API. Budúce rozšírenia pre WebAuthn a Android treba do kontraktu doplniť spolu s ich implementáciou.

Kontrakt nesmie prenášať súkromné kľúče, biometrické šablóny, heslá v odpovediach ani TOTP tajomstvá po aktivácii faktora.
