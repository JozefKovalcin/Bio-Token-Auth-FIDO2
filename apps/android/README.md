# Android

Plán: Kotlin, Jetpack Compose, Coroutines/Flow, AndroidX Biometric, Android Keystore. Obrazovky: párovanie, skenovanie QR, kontrola požiadavky, biometrické schválenie, zoznam zariadení/stav.

UI oddeľte od state holderov. Privátny podpisový kľúč má byť neexportovateľný a autorizovaný pri každom použití pomocou BIOMETRIC_STRONG/CryptoObject. Invalidation pri zmene biometrického enrollmentu musí viesť k opätovnému párovaniu. Hardvérovú ochranu a attestation overujte podľa možností cieľového telefónu; samotný podpis nepreukazuje serveru všetky lokálne nastavenia kľúča.
