# API

Serverové aplikačné programovacie rozhranie (API, Application Programming Interface) používa NestJS, Prisma ORM 7.10.1 a PostgreSQL. Implementuje registráciu a režim A. Pri registrácii sa vytvorí účet s heslom; používateľ môže aktivovať TOTP a po aktivácii ho server vyžaduje pri každom novom prihlásení. Režimy B/C zatiaľ nie sú implementované.

Súbor `src/auth.controller.ts` prijíma HTTP požiadavky, overuje vstupy a spravuje cookies. `src/auth.service.ts` vykonáva autentifikačný tok a databázové operácie. Databázová schéma a migrácie sú v `prisma/`. API kontrakt je opísaný v [OpenAPI dokumente](../../packages/contracts/openapi.yaml).

Pri spustení cez Docker Compose sa migrácia vykoná pred štartom API. Účet možno vytvoriť vo webovom rozhraní alebo administrátorským nástrojom `scripts/New-User.ps1` z koreňa repozitára. Postup spustenia je v [návode na LAN test](../../docs/lan-test.md); podrobnosti o režime A sú v [dokumentácii implementácie](../../docs/mode-a.md).
