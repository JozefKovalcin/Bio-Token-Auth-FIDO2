package bio.attestation

import com.android.keyattestation.verifier.*
import com.google.protobuf.ByteString
import java.math.BigInteger
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.test.assertFails

class PolicyTest {
    private val hardware = AuthorizationList(
        purposes = setOf(BigInteger.valueOf(2)), algorithms = BigInteger.valueOf(3), keySize = BigInteger.valueOf(256),
        ecCurve = BigInteger.ONE, digests = setOf(BigInteger.valueOf(4)), userAuthType = BigInteger.valueOf(2),
        rootOfTrust = RootOfTrust(ByteString.EMPTY, true, VerifiedBootState.VERIFIED))
    private fun description(hw: AuthorizationList = hardware, sw: AuthorizationList = AuthorizationList()) = KeyDescription(
        BigInteger.valueOf(300), SecurityLevel.TRUSTED_ENVIRONMENT, BigInteger.valueOf(300),
        SecurityLevel.TRUSTED_ENVIRONMENT, ByteString.copyFromUtf8("test challenge"), ByteString.EMPTY, sw, hw)
    @Test fun biometricPerUseIsAccepted() { assertTrue(ApprovalPolicy(true).accepts(description())) }
    @Test fun biometricWithPasswordFallbackIsRejected() {
        assertFalse(ApprovalPolicy(true).accepts(description(hardware.copy(userAuthType = BigInteger.valueOf(3)))))
    }
    @Test fun reusableTimedAuthenticationIsRejected() {
        assertFalse(ApprovalPolicy(true).accepts(description(hardware.copy(authTimeout = BigInteger.valueOf(30)))))
    }
    @Test fun unauthenticatedAndSoftwareAuthorizedKeysAreRejected() {
        assertFalse(ApprovalPolicy(true).accepts(description(hardware.copy(noAuthRequired = true))))
        assertFalse(ApprovalPolicy(true).accepts(description(hardware.copy(userAuthType = null), AuthorizationList(userAuthType = BigInteger.valueOf(2)))))
    }
    @Test fun unlockedOrUnverifiedBootIsRejected() {
        assertFalse(ApprovalPolicy(true).accepts(description(hardware.copy(rootOfTrust = hardware.rootOfTrust!!.copy(deviceLocked = false)))))
        assertFalse(ApprovalPolicy(true).accepts(description(hardware.copy(rootOfTrust = hardware.rootOfTrust!!.copy(verifiedBootState = VerifiedBootState.UNVERIFIED)))))
    }
    @Test fun authKeyProfileCannotSubstituteForApproval() {
        val auth = description(hardware.copy(userAuthType = null, noAuthRequired = true))
        assertTrue(ApprovalPolicy(false).accepts(auth))
        assertFalse(ApprovalPolicy(true).accepts(auth))
        assertFalse(ApprovalPolicy(false).accepts(description()))
    }
    @Test fun signingAlgorithmPurposeAndDigestAreConstrained() {
        assertFalse(ApprovalPolicy(true).accepts(description(hardware.copy(purposes = setOf(BigInteger.ONE)))))
        assertFalse(ApprovalPolicy(true).accepts(description(hardware.copy(digests = setOf(BigInteger.valueOf(2))))))
        assertFalse(ApprovalPolicy(true).accepts(description(hardware.copy(ecCurve = BigInteger.valueOf(2)))))
    }
    @Test fun previouslyEnrolledCertificateBecomesUntrustedWhenRevoked() {
        var revoked = emptySet<String>()
        val service = AttestationService(AttestationApplicationId(emptySet(), emptySet())) { revoked }
        val evidence = mapOf("verifier" to "android/keyattestation@621149c4ebaeeea844d6f43098687c73c4d370a3", "certificateSerials" to "abc,def")
        assertTrue(service.trustStatus(evidence)["trusted"] == true)
        revoked = setOf("def")
        assertFails { service.trustStatus(evidence) }
    }
}
