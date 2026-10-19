# Architektúra

Pozri projektovú dokumentáciu v docs/architecture.md, ADR 0002 a apps/android/README.md. Android má samostatný Gradle build s :app (Compose, ViewModel, Keystore, biometria, kamera) a :core (Kotlin/JVM kontrakt, JOSE a HTTP). UI prijíma immutable state a callbacks; stavový holder spravuje StateFlow a operácie. MainActivity koordinuje CryptoObject prompt, čisté ApprovalScreen nevykonáva sieť ani kryptografiu.

API, politika session a mobilné operácie sú oddelené NestJS moduly. Interný JVM verifier používa oficiálnu Android Key Attestation knižnicu. Serverová politika rozhoduje o dostupných režimoch; fyzické akceptačné overenie zostáva samostatnou bránou. Upstream generátor ani convention plugins neexistujú.
