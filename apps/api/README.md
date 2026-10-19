# API

Serverové API používa NestJS, Prisma ORM 7.10.1 a PostgreSQL. Obsahuje A, WebAuthn enrollment/prihlásenie B/C, čerstvé účelové grants, správu politiky a faktorov, párovanie, mobilné JWS dôkazy a atomické dokončenie C. Moduly sú oddelené v `src/auth-modules.ts`; politika session je v `src/session-policy.service.ts`. Mobilné routy odmietajú browser cookies a vyžadujú vlastné kryptografické dôkazy.

B/C sú predvolene vypnuté. Vyžadujú [konfiguráciu dôvery a akceptačné overenie](../../docs/modes-b-c.md). Automatické testy s testovým enrollment trust boundary nepotvrdzujú fyzickú YubiKey atestáciu; C testové fixtures nenahrádzajú skutočnú Android atestáciu a biometriu.

Súbor `src/auth.controller.ts` prijíma HTTP požiadavky, overuje vstupy a spravuje cookies. `src/auth.service.ts` vykonáva autentifikačný tok a databázové operácie. Databázová schéma a migrácie sú v `prisma/`. API kontrakt je opísaný v [OpenAPI dokumente](../../packages/contracts/openapi.yaml).

Pri spustení cez Docker Compose sa migrácia vykoná pred štartom API. Účet možno vytvoriť vo webovom rozhraní alebo administrátorským nástrojom `scripts/New-User.ps1` z koreňa repozitára. Postup spustenia je v [návode na LAN test](../../docs/lan-test.md); podrobnosti o režime A sú v [dokumentácii implementácie](../../docs/mode-a.md).
