# Projektové skilly

Požadované zdroje a účel:

| Zdroj | Skill | Použitie |
| --- | --- | --- |
| vercel-labs/agent-skills | vercel-react-best-practices | React výkon a štruktúra |
| Kadajett/agent-nestjs-skills | nestjs-best-practices | NestJS moduly a bezpečnosť |
| prisma/skills | prisma-orm-setup | Prisma konfigurácia a migrácie |
| supabase/agent-skills | supabase-postgres-best-practices | PostgreSQL návrh a výkon |
| ashtanko/compose-android-template | compose-state-holder-ui-split | Compose UI / state holders |
| ashtanko/compose-android-template | kotlin-flow-state-event-modeling | Kotlin Flow, stav a udalosti |

Inštalácia je projektová pre agenta Codex cez `npx skills add <zdroj> --skill <názov> --agent codex --yes`. Posledné dva skilly možno nainštalovať jedným príkazom s oboma názvami. Používajte projektové SKILL.md, nevkladajte inštaláciu do CI. Verzie zdrojov eviduje skills CLI lockfile, ak ho generuje.

## Skutočný stav inštalácie

Všetkých šesť požadovaných skillov je uložených v `.agents/skills/`. Prvé štyri nainštaloval skills CLI a eviduje ich `skills-lock.json`.

Android skilly už aktuálna vetva zdroja pod pôvodnými názvami neponúka. Oba boli obnovené bez úprav z commitu `a69c8db62c0d27ad42fe57f57396aab06e13eb84` repozitára `ashtanko/compose-android-template`, z ciest `.agents/skills/compose-state-holder-ui-split` a `.agents/skills/kotlin-flow-state-event-modeling`. Inštaláciu vykonal systémový skill-installer s explicitným `--ref` a projektovým `--dest`; nie sú evidované v CLI lockfile. Presný zdroj a kontrolné súčty sú v `docs/android-skills-provenance.json`.

Relatívne odkazy Android skillov na ďalšie súvisiace skilly nie sú automaticky nainštalované. Pri potrebe ich použitia načítajte zdroj z rovnakého commitu; nenahrádzajte ich odlišnými pokynmi bez kontroly.

Pri príprave sa použili pravidlá NestJS feature modulov, Compose UI/state-holder split, explicitného Flow stavu a krátkych databázových transakcií. React/Prisma implementácia je ďalšia etapa. Prisma skill vyžaduje pri implementácii overiť podporovanú publikovanú verziu a načítať jej pokyny; samotná inštalácia skillu nie je ORM setup.
