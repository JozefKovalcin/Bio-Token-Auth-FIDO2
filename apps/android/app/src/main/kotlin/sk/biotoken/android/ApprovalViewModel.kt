package sk.biotoken.android

import android.security.keystore.KeyPermanentlyInvalidatedException
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import sk.biotoken.core.ApprovalRequest
import sk.biotoken.core.DeviceChallengeRequest
import sk.biotoken.core.DeviceKeyOperations
import sk.biotoken.core.HttpMobileApi
import sk.biotoken.core.JwsSigning
import sk.biotoken.core.LoginDetails
import sk.biotoken.core.MobileApi
import sk.biotoken.core.MobileApiException
import sk.biotoken.core.MobileChallengeRequest
import sk.biotoken.core.PairedDeviceStore
import sk.biotoken.core.PairingCandidate
import sk.biotoken.core.PairingCandidateRequest
import sk.biotoken.core.PairingProveRequest
import sk.biotoken.core.PairingResolveRequest
import sk.biotoken.core.ProofRequest
import sk.biotoken.core.StoredDevice
import sk.biotoken.core.TrustedService

enum class Screen {
    HOME,
    SCANNING_PAIRING,
    SCANNING_LOGIN,
    LOADING,
    PAIRING_CONSENT,
    WAITING_PC,
    DETAILS,
    BIOMETRIC,
    SUBMITTING,
    APPROVED,
    REJECTED,
    ERROR,
    KEY_INVALIDATED,
    REVOKED
}

data class ApprovalUiState(
    val screen: Screen = Screen.HOME,
    val serviceOrigin: String,
    val devicePresent: Boolean = false,
    val username: String = "",
    val confirmationCode: String = "",
    val expiresAt: String = "",
    val message: String = ""
)

data class SigningOperation(val id: String, val aliasPrefix: String, val signingInput: String)

private data class PairingWork(val token: String, val prefix: String, val candidate: PairingCandidate)

/** No SavedStateHandle: process recreation cannot replay a QR, a prompt or an approval. */
class ApprovalViewModel(
    private val service: TrustedService,
    private val keys: DeviceKeyOperations,
    private val store: PairedDeviceStore,
    private val api: MobileApi = HttpMobileApi(service),
    private val platformDispatcher: CoroutineDispatcher = Dispatchers.IO
) : ViewModel() {
    private val mutableState = MutableStateFlow(ApprovalUiState(serviceOrigin = service.origin))
    val state = mutableState.asStateFlow()
    private var device = store.load(service.origin)
    private var pairing: PairingWork? = null
    private var details: LoginDetails? = null
    private var transactionToken: String? = null
    private var activeSignature: SigningOperation? = null
    private var work: Job? = null

    init {
        mutableState.update { it.copy(devicePresent = device != null) }
    }

    fun scan(pairing: Boolean) {
        if (work?.isActive == true || activeSignature != null) return
        mutableState.update { it.copy(screen = if (pairing) Screen.SCANNING_PAIRING else Screen.SCANNING_LOGIN, message = "") }
    }

    fun scanned(raw: String) {
        val isPairing = state.value.screen == Screen.SCANNING_PAIRING
        if (!isPairing && state.value.screen != Screen.SCANNING_LOGIN) return
        execute {
            val token = service.parseQr(raw, if (isPairing) "pairing" else "login")
            if (isPairing) preparePairing(token) else resolveLogin(token)
        }
    }

    private suspend fun preparePairing(token: String) {
        check(device == null) { "Telefón už obsahuje spárované zariadenie. Najprv ho odvolajte na PC." }
        val resolved = api.pairingResolve(PairingResolveRequest(token))
        service.requireOrigin(resolved.serviceOrigin)
        service.requireFresh(resolved.expiresAt)
        val prefix = "bio-${UUID.randomUUID()}"
        try {
            val enrollment = withContext(platformDispatcher) { keys.create(prefix, resolved.attestationChallenge) }
            val candidate = api.pairingCandidate(
                PairingCandidateRequest(
                    token,
                    "Android ${android.os.Build.MODEL}".take(64),
                    enrollment.approvalPublicJwk,
                    enrollment.authPublicJwk,
                    enrollment.approvalAttestation,
                    enrollment.authAttestation
                )
            )
            service.requireFresh(candidate.expiresAt)
            JwsSigning.validate(
                candidate.signingInput,
                service.origin,
                "PAIRING_PROOF",
                candidate.deviceId,
                expectedClaims = mapOf(
                    "pairingId" to resolved.pairingId,
                    "approvalFingerprint" to JwsSigning.thumbprint(enrollment.approvalPublicJwk),
                    "authFingerprint" to JwsSigning.thumbprint(enrollment.authPublicJwk)
                )
            )
            pairing = PairingWork(token, prefix, candidate)
            mutableState.update {
                it.copy(
                    screen = Screen.PAIRING_CONSENT,
                    confirmationCode = candidate.confirmationCode,
                    expiresAt = candidate.expiresAt
                )
            }
        } catch (failure: Exception) {
            keys.delete(prefix)
            throw failure
        }
    }

    fun refreshDevice() = execute {
        val paired = requireNotNull(device) { "Najprv spárujte telefón." }
        val challenge = api.deviceChallenge(DeviceChallengeRequest(paired.deviceId))
        service.requireFresh(challenge.expiresAt)
        JwsSigning.validate(challenge.signingInput, service.origin, "DEVICE_STATUS", paired.deviceId)
        val proof = withContext(platformDispatcher) { keys.signRequest(paired.keyAliasPrefix, challenge.signingInput) }
        val result = api.deviceStatus(ProofRequest(challenge.challengeId, proof))
        check(result.deviceId == paired.deviceId)
        when (result.status) {
            "ACTIVE" -> mutableState.update {
                it.copy(screen = Screen.HOME, message = "Telefón je aktívny. Môžete naskenovať prihlásenie.")
            }
            "REVOKED" -> mutableState.update { it.copy(screen = Screen.REVOKED, message = "Zariadenie bolo na serveri odvolané.") }
            "CANDIDATE", "AWAITING_PC_CONFIRMATION" -> mutableState.update {
                it.copy(screen = Screen.WAITING_PC, confirmationCode = paired.confirmationCode)
            }
            else -> error("Neznámy stav zariadenia.")
        }
    }

    private suspend fun resolveLogin(token: String) {
        val paired = requireNotNull(device) { "Najprv spárujte telefón." }
        val challenge = api.authChallenge(MobileChallengeRequest(paired.deviceId, token, "resolve"))
        service.requireFresh(challenge.expiresAt)
        JwsSigning.validate(challenge.signingInput, service.origin, "LOGIN_RESOLVE", paired.deviceId)
        val proof = withContext(platformDispatcher) { keys.signRequest(paired.keyAliasPrefix, challenge.signingInput) }
        val resolved = api.resolve(ProofRequest(challenge.challengeId, proof))
        service.requireOrigin(resolved.serviceOrigin)
        service.requireFresh(resolved.expiresAt)
        JwsSigning.validate(
            resolved.signingInput,
            service.origin,
            "LOGIN_APPROVE",
            paired.deviceId,
            resolved.transactionId,
            resolved.username
        )
        details = resolved
        transactionToken = token
        mutableState.update { it.copy(screen = Screen.DETAILS, username = resolved.username, expiresAt = resolved.expiresAt) }
    }

    /** Called only by the explicit consent button, never from a lifecycle effect. */
    fun beginSignature(): SigningOperation? {
        if (activeSignature != null) return null
        val operation = when (state.value.screen) {
            Screen.PAIRING_CONSENT -> pairing?.let { pending ->
                service.requireFresh(pending.candidate.expiresAt)
                SigningOperation(UUID.randomUUID().toString(), pending.prefix, pending.candidate.signingInput)
            }
            Screen.DETAILS -> details?.let { pending ->
                service.requireFresh(pending.expiresAt)
                SigningOperation(UUID.randomUUID().toString(), requireNotNull(device).keyAliasPrefix, pending.signingInput)
            }
            else -> null
        } ?: return null
        activeSignature = operation
        mutableState.update { it.copy(screen = Screen.BIOMETRIC) }
        return operation
    }

    fun signatureSucceeded(operation: SigningOperation, approvalJws: String) {
        if (activeSignature?.id != operation.id) return
        activeSignature = null
        execute(Screen.SUBMITTING) {
            val enrollment = pairing
            if (enrollment != null) {
                service.requireFresh(enrollment.candidate.expiresAt)
                val auth = withContext(platformDispatcher) { keys.signRequest(enrollment.prefix, operation.signingInput) }
                val result = api.pairingProve(
                    PairingProveRequest(
                        enrollment.token,
                        enrollment.candidate.challengeId,
                        approvalJws,
                        auth
                    )
                )
                check(result.deviceId == enrollment.candidate.deviceId && result.status == "AWAITING_PC_CONFIRMATION")
                val stored = StoredDevice(result.deviceId, enrollment.prefix, service.origin, result.confirmationCode)
                store.save(stored)
                device = stored
                pairing = null
                mutableState.update {
                    it.copy(screen = Screen.WAITING_PC, devicePresent = true, confirmationCode = result.confirmationCode)
                }
            } else {
                val pending = requireNotNull(details)
                service.requireFresh(pending.expiresAt)
                val result = api.approve(ApprovalRequest(pending.challengeId, approvalJws))
                check(result.status == "APPROVED")
                clearLogin()
                mutableState.update { it.copy(screen = Screen.APPROVED) }
            }
        }
    }

    fun reject() = execute(Screen.SUBMITTING) {
        val paired = requireNotNull(device)
        val token = requireNotNull(transactionToken)
        val challenge = api.authChallenge(MobileChallengeRequest(paired.deviceId, token, "reject"))
        service.requireFresh(challenge.expiresAt)
        JwsSigning.validate(challenge.signingInput, service.origin, "LOGIN_REJECT", paired.deviceId)
        val proof = withContext(platformDispatcher) { keys.signRequest(paired.keyAliasPrefix, challenge.signingInput) }
        check(api.reject(ProofRequest(challenge.challengeId, proof)).status == "REJECTED")
        clearLogin()
        mutableState.update { it.copy(screen = Screen.REJECTED) }
    }

    fun biometricFailed(operation: SigningOperation?, invalidated: Boolean = false) {
        if (operation != null && activeSignature?.id != operation.id) return
        activeSignature = null
        mutableState.update {
            it.copy(
                screen = when {
                    invalidated -> Screen.KEY_INVALIDATED
                    pairing != null -> Screen.PAIRING_CONSENT
                    details != null -> Screen.DETAILS
                    else -> Screen.HOME
                },
                message = if (invalidated) {
                    "Biometrický kľúč bol zneplatnený. Odvolajte zariadenie a použite kontrolované opätovné párovanie."
                } else {
                    "Biometrické overenie bolo zrušené. Môžete ho výslovne zopakovať."
                }
            )
        }
    }

    fun home() {
        if (work?.isActive == true) return
        activeSignature = null
        pairing?.let { keys.delete(it.prefix) }
        pairing = null
        clearLogin()
        mutableState.update { ApprovalUiState(serviceOrigin = service.origin, devicePresent = device != null) }
    }

    fun forgetRevoked() {
        if (state.value.screen != Screen.REVOKED) return
        device?.let { keys.delete(it.keyAliasPrefix) }
        store.clear()
        device = null
        home()
    }

    private fun clearLogin() {
        details = null
        transactionToken = null
    }

    private fun execute(screen: Screen = Screen.LOADING, block: suspend () -> Unit) {
        if (work?.isActive == true) return
        mutableState.update { it.copy(screen = screen, message = "") }
        work = viewModelScope.launch {
            try {
                block()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                clearLogin()
                val message = when (failure) {
                    is MobileApiException -> failure.message.orEmpty()
                    is KeyPermanentlyInvalidatedException ->
                        "Biometrický kľúč bol zneplatnený. Je potrebné kontrolované opätovné párovanie."
                    is IOException ->
                        "Spojenie so serverom zlyhalo. Overte sieť, DNS a certifikát. Skontrolujte výsledok na PC."
                    is IllegalArgumentException, is IllegalStateException ->
                        "Požiadavku nemožno bezpečne spracovať. Skontrolujte stav na PC a začnite znova."
                    else -> "Operáciu sa nepodarilo dokončiť. Skontrolujte stav na PC."
                }
                val errorScreen = if (failure is KeyPermanentlyInvalidatedException) Screen.KEY_INVALIDATED else Screen.ERROR
                mutableState.update { it.copy(screen = errorScreen, message = message) }
            }
        }
    }

    override fun onCleared() {
        pairing?.let { keys.delete(it.prefix) }
        super.onCleared()
    }
}
