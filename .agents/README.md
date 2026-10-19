# Kontext agentov

Záväzné požiadavky: [AGENTS.md](../AGENTS.md).

Referencie: [architektúra](reference/architecture.md), [implementácia](reference/implementation.md), [testovanie](reference/testing.md), [príkazy](reference/commands.md), [bezpečnosť](reference/security.md), [výkon](reference/performance.md), [rozhodnutia](reference/decisions.md).

Android má samostatný Gradle wrapper a moduly :app/:core v apps/android. Aktuálne overovacie tasky sú v reference/commands.md a apps/android/README.md. Upstream generátor modulov, convention plugins ani Makefile nie sú súčasťou projektu; používajte iba reálne existujúce tasky.
