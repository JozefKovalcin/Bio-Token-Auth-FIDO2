package sk.biotoken.core

import kotlinx.serialization.Serializable

// Kept in sync with packages/contracts/openapi.yaml; serialization tests own this boundary.
@Serializable
data class EcPublicJwk(val kty: String = "EC", val crv: String = "P-256", val x: String, val y: String)

@Serializable
data class PairingResolveRequest(val pairingToken: String)

@Serializable
data class PairingResolved(val pairingId: String, val attestationChallenge: String, val expiresAt: String, val serviceOrigin: String)

@Serializable
data class PairingCandidateRequest(
    val pairingToken: String,
    val label: String,
    val approvalPublicJwk: EcPublicJwk,
    val authPublicJwk: EcPublicJwk,
    val approvalAttestation: List<String>,
    val authAttestation: List<String>
)

@Serializable
data class PairingCandidate(
    val deviceId: String,
    val challengeId: String,
    val signingInput: String,
    val confirmationCode: String,
    val expiresAt: String
)

@Serializable
data class PairingProveRequest(val pairingToken: String, val challengeId: String, val approvalJws: String, val authJws: String)

@Serializable
data class PairingProved(val deviceId: String, val confirmationCode: String, val status: String)

@Serializable
data class DeviceChallengeRequest(val deviceId: String)

@Serializable
data class MobileChallengeRequest(val deviceId: String, val transactionToken: String, val operation: String)

@Serializable
data class SigningChallenge(val challengeId: String, val signingInput: String, val expiresAt: String)

@Serializable
data class ProofRequest(val challengeId: String, val proofJws: String)

@Serializable
data class ApprovalRequest(val challengeId: String, val approvalJws: String)

@Serializable
data class DeviceStatus(val deviceId: String, val status: String)

@Serializable
data class LoginDetails(
    val transactionId: String,
    val username: String,
    val serviceOrigin: String,
    val expiresAt: String,
    val challengeId: String,
    val signingInput: String
)

@Serializable
data class OperationStatus(val status: String)

data class StoredDevice(val deviceId: String, val keyAliasPrefix: String, val origin: String, val confirmationCode: String)

interface MobileApi {
    suspend fun pairingResolve(request: PairingResolveRequest): PairingResolved
    suspend fun pairingCandidate(request: PairingCandidateRequest): PairingCandidate
    suspend fun pairingProve(request: PairingProveRequest): PairingProved
    suspend fun deviceChallenge(request: DeviceChallengeRequest): SigningChallenge
    suspend fun deviceStatus(request: ProofRequest): DeviceStatus
    suspend fun authChallenge(request: MobileChallengeRequest): SigningChallenge
    suspend fun resolve(request: ProofRequest): LoginDetails
    suspend fun approve(request: ApprovalRequest): OperationStatus
    suspend fun reject(request: ProofRequest): OperationStatus
}
