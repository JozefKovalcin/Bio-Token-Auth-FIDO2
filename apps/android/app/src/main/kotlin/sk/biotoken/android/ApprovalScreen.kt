package sk.biotoken.android

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import sk.biotoken.core.ServiceConnectionResult

/** Pure immutable state + callbacks; no ViewModel, Flow, network or cryptography. */
@Composable
fun ApprovalScreen(
    state: ApprovalUiState,
    onPair: () -> Unit,
    onLogin: () -> Unit,
    onAuthenticate: () -> Unit,
    onReject: () -> Unit,
    onRefresh: () -> Unit,
    onHome: () -> Unit,
    onForget: () -> Unit,
    onCheckConnection: () -> Unit
) {
    Surface(Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.padding(24.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("Bio Token", style = MaterialTheme.typography.headlineLarge)
            Text("Dôveryhodná služba: ${state.serviceOrigin}")
            when (state.screen) {
                Screen.HOME -> {
                    OutlinedButton(onClick = onCheckConnection) { Text("Overiť spojenie so serverom") }
                    state.connectionResult?.let { result ->
                        Text("Kontrola spojenia: ${result.name}")
                        Text(connectionExplanation(result))
                        Text("Kontrola overuje iba dostupnosť API cez HTTPS; nepotvrdzuje biometriu, atestáciu ani prihlásenie C.")
                    }
                    Text(
                        if (state.devicePresent) {
                            "Telefón je uložený v aplikácii. Stav overuje server."
                        } else {
                            "Spárujte telefón z nastavení účtu na PC."
                        }
                    )
                    if (!state.devicePresent) Button(onClick = onPair, modifier = Modifier.fillMaxWidth()) { Text("Naskenovať párovanie") }
                    if (state.devicePresent) {
                        Button(onClick = onLogin, modifier = Modifier.fillMaxWidth()) { Text("Naskenovať prihlásenie") }
                        OutlinedButton(onClick = onRefresh) { Text("Overiť stav zariadenia") }
                    }
                }
                Screen.PAIRING_CONSENT -> {
                    Text("Pridať tento telefón k účtu", style = MaterialTheme.typography.titleLarge)
                    Text("Biometriou potvrďte vlastníctvo kľúča. Potom porovnajte kód na pôvodnom PC a potvrďte párovanie.")
                    Text("Porovnávací kód: ${state.confirmationCode}")
                    Text("Platnosť: ${state.expiresAt}")
                    Button(onClick = onAuthenticate) { Text("Biometricky potvrdiť párovanie") }
                }
                Screen.WAITING_PC -> {
                    Text("Dokončite párovanie na pôvodnom PC", style = MaterialTheme.typography.titleLarge)
                    Text("Porovnajte celý kód: ${state.confirmationCode}")
                    Text("Telefón sa aktivuje až po vašom potvrdení na PC.")
                    Button(onClick = onRefresh) { Text("Overiť potvrdenie") }
                }
                Screen.DETAILS -> {
                    Text("Schváliť prihlásenie", style = MaterialTheme.typography.titleLarge)
                    Text("Účet: ${state.username}")
                    Text("Platnosť: ${state.expiresAt}")
                    Text("Schváľte iba prihlásenie, ktoré ste práve začali na svojom PC. QR kód nedokazuje fyzickú blízkosť.")
                    Button(onClick = onAuthenticate, modifier = Modifier.fillMaxWidth()) { Text("Schváliť biometriou") }
                    OutlinedButton(onClick = onReject) { Text("Zamietnuť prihlásenie") }
                }
                Screen.LOADING, Screen.CHECKING_CONNECTION, Screen.BIOMETRIC, Screen.SUBMITTING -> {
                    CircularProgressIndicator()
                    Text(
                        when (state.screen) {
                            Screen.BIOMETRIC -> "Dokončite systémové biometrické overenie."
                            Screen.SUBMITTING -> "Odosiela sa dôkaz serveru…"
                            Screen.CHECKING_CONNECTION -> "Overuje sa DNS, HTTPS a verejné API…"
                            else -> "Overuje sa požiadavka…"
                        }
                    )
                }
                Screen.APPROVED -> {
                    Text("Podpis bol prijatý. Dokončite prihlásenie na pôvodnom PC.")
                    Text("Táto aplikácia nezískala webovú reláciu.")
                }
                Screen.REJECTED -> Text("Prihlásenie bolo zamietnuté.")
                Screen.EXPIRED -> Text("Požiadavka vypršala. Začnite nový tok na PC a naskenujte nový QR kód.")
                Screen.KEY_INVALIDATED -> {
                    Text("Biometrický kľúč už nie je platný. Odvolajte telefón na PC a použite kontrolované opätovné párovanie.")
                    Button(onClick = onRefresh) { Text("Overiť odvolanie") }
                }
                Screen.REVOKED -> {
                    Text("Telefón bol odvolaný alebo jeho párovanie nebolo dokončené. Nemôže schvaľovať prihlásenia.")
                    Button(onClick = onForget) { Text("Odstrániť neaktívne miestne kľúče") }
                }
                Screen.ERROR -> Text("Operácia sa nedokončila.")
                Screen.SCANNING_PAIRING, Screen.SCANNING_LOGIN -> Unit
            }
            if (state.message.isNotEmpty()) Text(state.message)
            if (state.screen !in setOf(Screen.HOME, Screen.LOADING, Screen.CHECKING_CONNECTION, Screen.SUBMITTING, Screen.BIOMETRIC)) {
                OutlinedButton(onClick = onHome) { Text("Späť") }
            }
        }
    }
}

private fun connectionExplanation(result: ServiceConnectionResult): String = when (result) {
    ServiceConnectionResult.REACHABLE -> "Aplikácia dôveruje HTTPS spojeniu a API odpovedá správne."
    ServiceConnectionResult.DNS_FAILURE -> "Telefón nevie preložiť názov služby. Overte Wi-Fi DNS a nastavenie Súkromného DNS."
    ServiceConnectionResult.TLS_IDENTITY_FAILURE -> "Certifikát nezodpovedá názvu služby. Overte hostname a certifikát servera."
    ServiceConnectionResult.TLS_FAILURE -> "Overenie HTTPS zlyhalo. Overte verejnú LAN CA, platnosť certifikátu a čas telefónu."
    ServiceConnectionResult.TIMEOUT -> "Server neodpovedal v časovom limite. Overte sieť a dostupnosť servera."
    ServiceConnectionResult.CONNECTION_FAILURE -> "Pripojenie k serveru sa nepodarilo. Overte spustený server, port 443 a firewall."
    ServiceConnectionResult.HTTP_FAILURE -> "Server vrátil neočakávaný HTTP stav. Overte HTTPS proxy a smerovanie API."
    ServiceConnectionResult.INVALID_RESPONSE -> "Odpoveď nezodpovedá verejnému API tejto aplikácie. Overte adresu a verziu servera."
    ServiceConnectionResult.NETWORK_FAILURE -> "Sieťové spojenie zlyhalo. Overte pripojenie telefónu a servera."
}

@Preview(showBackground = true)
@Composable
private fun ApprovalPreview() {
    MaterialTheme {
        ApprovalScreen(
            ApprovalUiState(Screen.DETAILS, "https://bio-token.home.arpa", true, "demo", expiresAt = "2026-10-19T10:00:00Z"),
            {},
            {},
            {},
            {},
            {},
            {},
            {},
            {}
        )
    }
}
