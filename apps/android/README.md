# Android klient

Samostatná Android aplikácia zatiaľ nie je implementovaná. Plánované technológie sú Kotlin, Jetpack Compose, Coroutines/Flow, AndroidX Biometric a Android Keystore. Navrhovaný klient má podporovať párovanie, načítanie QR požiadavky, zobrazenie jej údajov a biometrické schválenie.

Súkromný podpisový kľúč má byť neexportovateľný a jeho použitie má vyžadovať `BIOMETRIC_STRONG` cez `CryptoObject`. Zmena biometrického zápisu môže kľúč zneplatniť a vyžadovať opätovné párovanie. Podpis sám osebe serveru nedokazuje hardvérovú ochranu kľúča; tá vyžaduje overenie atestácie podľa možností telefónu.
