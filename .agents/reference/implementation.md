# Implementácia

Dodržujte [tok](../../docs/authentication-flow.md). Mobil podpisuje výzvu biometricky autorizovaným Keystore kľúčom. Stav odlišuje načítanie, požiadavku, zamietnutie, expiráciu a úspech. UI oddeľte od state holderov. Flow primitive voľte podľa replay, fan-out a lifecycle. Autoritatívny stav transakcie patrí serveru; nevytvárajte falošné doménové počiatočné hodnoty.
