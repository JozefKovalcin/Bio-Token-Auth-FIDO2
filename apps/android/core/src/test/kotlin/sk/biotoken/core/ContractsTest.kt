package sk.biotoken.core

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class ContractsTest {
    @Test fun pairingPublicKeysIncludeRequiredOpenApiDiscriminators() {
        val publicKey = EcPublicJwk(x = "x".repeat(43), y = "y".repeat(43))
        val body = Json { encodeDefaults = true }.encodeToString(
            PairingCandidateRequest("pairing-token", "phone", publicKey, publicKey, listOf("DER"), listOf("DER"))
        )
        val root = Json.parseToJsonElement(body).jsonObject
        val jwk = root.getValue("approvalPublicJwk").jsonObject
        assertEquals("EC", jwk.getValue("kty").jsonPrimitive.content)
        assertEquals("P-256", jwk.getValue("crv").jsonPrimitive.content)
        assertEquals(
            setOf("pairingToken", "label", "approvalPublicJwk", "authPublicJwk", "approvalAttestation", "authAttestation"),
            root.keys
        )
    }
}
