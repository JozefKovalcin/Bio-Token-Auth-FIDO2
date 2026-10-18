# Projektové vývojové pokyny

Pre web a API sú v repozitári dostupné pokyny `vercel-react-best-practices`, `nestjs-best-practices`, `prisma-orm-setup` a `supabase-postgres-best-practices`.

Android pokyny pochádzajú z repozitára `ashtanko/compose-android-template`:

- compose-state-holder-ui-split: oddelenie UI a state holdera.
- kotlin-flow-state-event-modeling: Flow, stav a udalosti.
- add-android-module: pridávanie modulov.
- deliver-android-feature: implementácia funkcie a dôkazy správnosti.
- verify-android-change: primerané overovanie.

## Aktualizácia

Zdroj Android pokynov sme overili 2026-10-11 na commite `510e52b62464e8663c33706ea35eb81b432bd33e`. Dva existujúce pokyny sme porovnali s commitom `a69c8db62c0d27ad42fe57f57396aab06e13eb84`; ich obsah sa nezmenil.

Tri workflow pokyny sú nainštalované projektovo pre Codex:

```powershell
npx --yes skills add ashtanko/compose-android-template --skill add-android-module deliver-android-feature verify-android-change --agent codex --yes
```

Sedem inštalácií cez CLI eviduje `skills-lock.json`. `android-skills-provenance.json` zaznamenáva dva manuálne pridané pokyny a pôvod všetkých piatich Android pokynov. Všetkých deväť adresárov je v `.agents/skills/`.

## Použitie

Pred Android prácou načítajte `.agents/README.md` a relevantné dokumenty v `.agents/reference/`. Android pokyny predpokladajú úplnú šablónu upstream projektu. Tento repozitár zatiaľ nemá generátor modulov, Gradle wrapper, convention plugins ani Makefile. Používajte iba príkazy a nástroje, ktoré v projekte skutočne existujú.

Referencie opisujú tento projekt a nie sú kópiami upstream šablóny. Ďalšie zamerané pokyny uvedené v Android materiáloch nie sú automaticky nainštalované. Ak ich implementácia vyžaduje, načítajte zdroj z evidovaného commitu.

Pri zmene konfigurácie Prisma overte kompatibilitu používanej verzie s databázou a načítajte súvisiace pokyny. Inštalácia vývojového pokynu sama osebe nemení konfiguráciu ORM.
