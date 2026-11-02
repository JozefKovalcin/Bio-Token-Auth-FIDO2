# Spustenie a vypnutie na tomto notebooku

Overené 2. novembra 2026. Existujúca inštancia používa `https://auth.bio-token.test/`, lokálnu databázu a spárovanú aplikáciu Bio Token. Základný fyzický tok B aj C prešiel; podrobnosti a nevykonané negatívne skúšky sú vo [verification.md](verification.md).

## Spustenie

1. Pripojte notebook a telefón do rovnakej Wi-Fi. Otvorte Docker Desktop a počkajte na bežiaci Linux engine.
2. Otvorte PowerShell v projekte:

```powershell
Set-Location -LiteralPath 'C:\Users\jozef\Downloads\Nový priečinok (3)\Bio-Token-Auth-FIDO2'
```

3. Skontrolujte IP notebooku. Pri tomto overení bola **192.168.68.120/22**:

```powershell
Get-NetIPAddress -InterfaceAlias 'Wi-Fi' -AddressFamily IPv4 |
    Select-Object IPAddress, PrefixLength
```

Ak sa IP zmenila, najprv upravte LAN odpoveď v lokálnom `infra/data/local-dns/Corefile.windows`, adresu v projektových firewall pravidlách a DNS telefónu podľa [LAN návodu](lan-test.md). Loopback odpoveď pre PC zostáva `127.0.0.1`. Existujúci `Enable-LanAcceptance.ps1` nevynucujte cez kolidujúce pravidlá; pôvodné pravidlá zachovávajú konkrétnu lokálnu adresu a podsieť.

4. Spustite pripravený lokálny DNS a aktuálnu zostavu:

```powershell
& ./.tooling/start-local-dns.ps1
docker compose --profile mode-c up --build -d --wait
docker compose --profile mode-c ps
Invoke-RestMethod https://auth.bio-token.test/api/auth/capabilities
Start-Process 'https://auth.bio-token.test/'
```

Na tejto zachovanej inštancii majú capabilities obsahovať **A, B aj C**. Profil `mode-c` spúšťa interný verifier, ale nemení C flagy; tie boli lokálne zapnuté až po fyzickej bráne. Na novom PC zostávajú predvolene vypnuté. Ak sa ponuka po zmene nastavení javí zastaraná, obnovte stránku cez **Ctrl+F5**.

5. V telefóne pri použití tohto lokálneho DNS nastavte DNS pripojenej Wi-Fi na **192.168.68.120** a **Súkromný DNS → Automatický**. Pri statickom nastavení zachovajte aktuálnu IP, bránu a prefix telefónu. V aplikácii Bio Token stlačte **Overiť spojenie so serverom**; výsledok má byť **REACHABLE**. Verejná CA už bola na tomto telefóne overená; súkromný CA kľúč sa neprenáša.

Prihlásenie C: na PC zvoľte C a potvrďte YubiKey; v hlavnej aplikácii Bio Token naskenujte prihlasovací QR a schváľte odtlačkom. Testovací APK ani USB ladenie nie sú potrebné na bežné LAN prihlásenie už spárovaným telefónom. Správa faktorov vyžaduje prihlásenie čerstvé najviac päť minút; po uplynutí sa znovu prihláste a pokračujte s existujúcimi faktormi.

## Vypnutie

V PowerShelli z rovnakého priečinka:

```powershell
docker compose --profile mode-c down

$demoDnsExe = Join-Path (Get-Location) '.tooling\coredns\coredns.exe'
Get-CimInstance Win32_Process -Filter "Name='coredns.exe'" |
    Where-Object { $_.ExecutablePath -eq $demoDnsExe } |
    ForEach-Object { Stop-Process -Id $_.ProcessId }
```

Tým sa zastavia projektové služby a iba vlastný DNS proces. **Nepoužívajte `down -v`**: bežné `down` zachová účty, párovanie aj CA vo volumes. Zatvorte projektovú kartu prehliadača. Na telefóne vráťte IP/DNS Wi-Fi na **DHCP/Automatické**, aby po vypnutí notebookového DNS fungovalo bežné pripojenie.

`.env`, Docker volumes, lokálna CA, trust podklady, SDK, signing keystore a APK nie sú v Gite. Zachovajte ich na tomto notebooku. Pri ďalšom štarte negenerujte novú konfiguráciu cez `Init-Lan.ps1` a neodinštalujte spárovanú aplikáciu. Podrobný postup na inom zariadení je v [odovzdávacom návode](handoff-next-device.md).
