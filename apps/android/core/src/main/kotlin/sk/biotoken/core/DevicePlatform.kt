package sk.biotoken.core

data class EnrollmentKeys(
    val approvalPublicJwk: EcPublicJwk,
    val authPublicJwk: EcPublicJwk,
    val approvalAttestation: List<String>,
    val authAttestation: List<String>
)

interface DeviceKeyOperations {
    fun create(prefix: String, attestationChallenge: String): EnrollmentKeys
    fun signRequest(prefix: String, signingInput: String): String
    fun delete(prefix: String)
}

interface PairedDeviceStore {
    fun load(origin: String): StoredDevice?
    fun save(device: StoredDevice)
    fun clear()
}
