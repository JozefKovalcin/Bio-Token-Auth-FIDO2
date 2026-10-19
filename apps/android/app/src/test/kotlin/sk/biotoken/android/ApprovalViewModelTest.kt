package sk.biotoken.android

import java.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import sk.biotoken.core.ApprovalRequest
import sk.biotoken.core.DeviceChallengeRequest
import sk.biotoken.core.DeviceKeyOperations
import sk.biotoken.core.DeviceStatus
import sk.biotoken.core.EnrollmentKeys
import sk.biotoken.core.LoginDetails
import sk.biotoken.core.MobileApi
import sk.biotoken.core.MobileChallengeRequest
import sk.biotoken.core.OperationStatus
import sk.biotoken.core.PairedDeviceStore
import sk.biotoken.core.PairingCandidate
import sk.biotoken.core.PairingCandidateRequest
import sk.biotoken.core.PairingProveRequest
import sk.biotoken.core.PairingProved
import sk.biotoken.core.PairingResolveRequest
import sk.biotoken.core.PairingResolved
import sk.biotoken.core.ProofRequest
import sk.biotoken.core.SigningChallenge
import sk.biotoken.core.StoredDevice
import sk.biotoken.core.TrustedService

@OptIn(ExperimentalCoroutinesApi::class)
class ApprovalViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val origin = "https://bio-token.home.arpa"
    private val token = "a".repeat(43)
    private lateinit var api: FakeApi
    private lateinit var store: FakeStore
    private lateinit var keys: FakeKeys

    @Before fun setup() {
        Dispatchers.setMain(dispatcher)
        api = FakeApi()
        store = FakeStore()
        keys = FakeKeys()
    }

    @After fun tearDown() {
        Dispatchers.resetMain()
    }
    private fun model() = ApprovalViewModel(TrustedService(origin), keys, store, api, dispatcher)
    private fun qr(server: String = origin) = """{"v":1,"type":"login","token":"$token","origin":"$server"}"""

    @Test fun cancelledPromptAndLateCallbackNeverApprove() = runTest(dispatcher) {
        val model = model()
        model.scan(false)
        model.scanned(qr())
        advanceUntilIdle()
        assertEquals(Screen.DETAILS, model.state.value.screen)
        assertEquals("alice", model.state.value.username)
        val operation = requireNotNull(model.beginSignature())
        assertNull(model.beginSignature())
        model.biometricFailed(operation)
        model.signatureSucceeded(operation, "stale-proof")
        advanceUntilIdle()
        assertEquals(0, api.approvals)
        assertEquals(Screen.DETAILS, model.state.value.screen)
        val renewed = requireNotNull(model.beginSignature())
        assertNotEquals(operation.id, renewed.id)
        model.signatureSucceeded(renewed, "new-proof")
        model.signatureSucceeded(renewed, "duplicate-proof")
        advanceUntilIdle()
        assertEquals(1, api.approvals)
        assertEquals(Screen.APPROVED, model.state.value.screen)
    }

    @Test fun newProcessRestoresOnlyPublicDeviceNotConsentOrPendingSignature() = runTest(
        dispatcher
    ) {
        val old = model()
        old.scan(false)
        old.scanned(qr())
        advanceUntilIdle()
        assertNotNull(old.beginSignature())
        val restored = model()
        assertEquals(Screen.HOME, restored.state.value.screen)
        assertNull(restored.beginSignature())
        assertEquals(0, api.approvals)
    }

    @Test fun unknownQrOriginDoesNotContactApiOrSignRequest() = runTest(dispatcher) {
        val model = model()
        model.scan(false)
        model.scanned(qr("https://attacker.example"))
        advanceUntilIdle()
        assertEquals(Screen.ERROR, model.state.value.screen)
        assertEquals(0, api.challengeRequests)
        assertEquals(0, keys.signatures)
    }

    @Test fun onlyAuthenticatedRevokedStatusAllowsRemovingLocalKeys() = runTest(dispatcher) {
        val model = model()
        model.forgetRevoked()
        assertNotNull(store.value)
        api.status = "REVOKED"
        model.refreshDevice()
        advanceUntilIdle()
        assertEquals(Screen.REVOKED, model.state.value.screen)
        model.forgetRevoked()
        assertNull(store.value)
        assertFalse(model.state.value.devicePresent)
        assertEquals(listOf("alias"), keys.deleted)
    }

    private class FakeStore : PairedDeviceStore {
        var value: StoredDevice? =
            StoredDevice("device", "alias", "https://bio-token.home.arpa", "code")
        override fun load(origin: String) = value?.takeIf { it.origin == origin }
        override fun save(device: StoredDevice) {
            value = device
        }
        override fun clear() {
            value = null
        }
    }
    private class FakeKeys : DeviceKeyOperations {
        var signatures = 0
        val deleted = mutableListOf<String>()
        override fun create(prefix: String, attestationChallenge: String): EnrollmentKeys = error("Not used")
        override fun signRequest(prefix: String, signingInput: String): String {
            signatures++
            return "device-proof"
        }
        override fun delete(prefix: String) {
            deleted += prefix
        }
    }
    private class FakeApi : MobileApi {
        var approvals = 0
        var challengeRequests = 0
        var status = "ACTIVE"
        private val expiry = "2099-01-01T00:00:00Z"
        private fun input(purpose: String, requestPath: String? = null): String {
            fun b64(value: String) = Base64.getUrlEncoder().withoutPadding().encodeToString(value.toByteArray())
            val request = requestPath?.let {
                """, "request":{"method":"POST","path":"$it"}"""
            }.orEmpty()
            return b64("""{"alg":"ES256","typ":"bio-mobile+jws"}""") + "." + b64(
                """{"version":1,"aud":"https://bio-token.home.arpa","purpose":"$purpose","nonce":"nonce","jti":"id","exp":4070908800,"deviceId":"device","transactionId":"transaction","username":"alice"$request}"""
            )
        }
        override suspend fun authChallenge(request: MobileChallengeRequest): SigningChallenge {
            challengeRequests++
            return SigningChallenge(
                "request-challenge",
                input(
                    if (request.operation ==
                        "resolve"
                    ) {
                        "LOGIN_RESOLVE"
                    } else {
                        "LOGIN_REJECT"
                    },
                    "/api/mobile/auth/${request.operation}"
                ),
                expiry
            )
        }
        override suspend fun resolve(request: ProofRequest) = LoginDetails(
            "transaction",
            "alice",
            "https://bio-token.home.arpa",
            expiry,
            "approval-challenge",
            input("LOGIN_APPROVE")
        )
        override suspend fun approve(request: ApprovalRequest): OperationStatus {
            approvals++
            return OperationStatus("APPROVED")
        }
        override suspend fun reject(request: ProofRequest) = OperationStatus("REJECTED")
        override suspend fun deviceChallenge(request: DeviceChallengeRequest) =
            SigningChallenge("status", input("DEVICE_STATUS", "/api/mobile/devices/status"), expiry)
        override suspend fun deviceStatus(request: ProofRequest) = DeviceStatus("device", status)
        override suspend fun pairingResolve(request: PairingResolveRequest): PairingResolved = error("Not used")
        override suspend fun pairingCandidate(request: PairingCandidateRequest): PairingCandidate = error("Not used")
        override suspend fun pairingProve(request: PairingProveRequest): PairingProved = error("Not used")
    }
}
