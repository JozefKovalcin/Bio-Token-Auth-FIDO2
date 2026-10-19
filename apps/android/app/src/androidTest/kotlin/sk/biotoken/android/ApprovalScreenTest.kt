package sk.biotoken.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

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
                    {}
                )
            }
        }
        compose.onNodeWithText("Účet: alice").assertIsDisplayed()
        assertEquals(0, approvals)
        compose.onNodeWithText("Schváliť biometriou").performClick()
        assertEquals(1, approvals)
    }
}
