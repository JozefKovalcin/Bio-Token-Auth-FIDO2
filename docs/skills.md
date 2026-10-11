# Projektové skilly

Web/API skilly: vercel-react-best-practices, nestjs-best-practices, prisma-orm-setup, supabase-postgres-best-practices.

Android skilly z ashtanko/compose-android-template:

- compose-state-holder-ui-split: oddelenie UI a state holdera.
- kotlin-flow-state-event-modeling: Flow, stav a udalosti.
- add-android-module: pridávanie modulov.
- deliver-android-feature: implementácia funkcie a dôkazy správnosti.
- verify-android-change: primerané overovanie.

## Aktualizácia

Zdroj overený 2026-10-11 na commite `510e52b62464e8663c33706ea35eb81b432bd33e`. Pôvodné dva skilly existujú aj tu a oproti historickému commitu `a69c8db62c0d27ad42fe57f57396aab06e13eb84` sa obsahovo nezmenili. Pôvodná informácia o odstránení bola nepresná: skills CLI ich neuvádza medzi objavenými skillmi.

Tri workflow skilly boli nainštalované projektovo pre Codex:

```powershell
npx --yes skills add ashtanko/compose-android-template --skill add-android-module deliver-android-feature verify-android-change --agent codex --yes
```

Sedem CLI inštalácií eviduje `skills-lock.json`. Dva manuálne inštalované skilly a aktuálny zdroj všetkých piatich Android skillov eviduje `android-skills-provenance.json`. Všetkých deväť skillov je v `.agents/skills/`.

## Použitie

Pred Android prácou načítajte `.agents/README.md` a relevantné `.agents/reference/` dokumenty. Nové skilly predpokladajú plný upstream Android template. Tento projekt zatiaľ nemá generátor modulov, Gradle wrapper, convention plugins ani Makefile. Nespúšťajte neexistujúce príkazy a nepreberajte template balíky ako fakty projektu.

Referencie sú projektové, nie kópie upstream template. Ďalšie focused skilly spomínané v pokynoch nie sú automaticky nainštalované; pri potrebe načítajte zdroj z evidovaného commitu.

React/Prisma implementácia je ďalšia etapa. Pri Prisma setup overte publikovanú podporovanú verziu a načítajte jej pokyny; inštalácia skillu nie je ORM setup.
