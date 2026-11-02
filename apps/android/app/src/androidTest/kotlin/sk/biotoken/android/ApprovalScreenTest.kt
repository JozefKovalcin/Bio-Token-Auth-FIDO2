package sk.biotoken.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import sk.biotoken.core.ServiceConnectionResult

class ApprovalScreenTest {
    @get:Rule val compose = createComposeRule()

    @Test fun detailsExposeTrustedServiceAccountAndExplicitConsent() {
        var approvals = 0
        compose.setContent {
            MaterialTheme {
                ApprovalScreen(
                    ApprovalUiState(
                        Screen.DETAILS,
                        "https://bio-token.home.arpa",
                        true,
                        "alice",
                        expiresAt = "2099-01-01T00:00:00Z"
                    ),
                    {},
                    {},
                    { approvals++ },
                    {},
                    {},
                    {},
                    {},
                    {}
                )
            }
        }
        compose.onNodeWithText("Účet: alice").assertIsDisplayed()
        assertEquals(0, approvals)
        compose.onNodeWithText("Schváliť biometriou").performClick()
        assertEquals(1, approvals)
    }

    @Test fun homeExposesExplicitConnectionCheckWithoutPairingOrBiometricConsent() {
        var checks = 0
        var approvals = 0
        compose.setContent {
            MaterialTheme {
                ApprovalScreen(
                    state = ApprovalUiState(
                        serviceOrigin = "https://auth.bio-token.test",
                        connectionResult = ServiceConnectionResult.TLS_FAILURE
                    ),
                    onPair = {},
                    onLogin = {},
                    onAuthenticate = { approvals++ },
                    onReject = {},
                    onRefresh = {},
                    onHome = {},
                    onForget = {},
                    onCheckConnection = { checks++ }
                )
            }
        }
        compose.onNodeWithText("Kontrola spojenia: TLS_FAILURE").assertIsDisplayed()
        compose.onNodeWithText("Overiť spojenie so serverom").performClick()
        assertEquals(1, checks)
        assertEquals(0, approvals)
    }
}
