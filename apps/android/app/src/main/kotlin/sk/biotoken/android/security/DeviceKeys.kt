package sk.biotoken.android.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.util.Base64
import sk.biotoken.core.DeviceKeyOperations
import sk.biotoken.core.EcPublicJwk
import sk.biotoken.core.EnrollmentKeys
import sk.biotoken.core.JwsSigning

/** Never exports private keys; approval and device-request authentication are distinct keys. */
class DeviceKeys : DeviceKeyOperations {
    private val store: KeyStore get() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    override fun create(prefix: String, attestationChallenge: String): EnrollmentKeys {
        val challenge = Base64.getUrlDecoder().decode(attestationChallenge)
        require(challenge.size in 16..128) { "Neplatná atestačná výzva." }
        try {
            generate("$prefix-approval", challenge, biometric = true)
            generate("$prefix-auth", challenge, biometric = false)
            return EnrollmentKeys(
                publicJwk("$prefix-approval"),
                publicJwk("$prefix-auth"),
                certificateChain("$prefix-approval"),
                certificateChain("$prefix-auth")
            )
        } catch (failure: Exception) {
            delete(prefix)
            throw failure
        }
    }

    private fun generate(alias: String, challenge: ByteArray, biometric: Boolean) {
        check(!store.containsAlias(alias)) { "Alias kľúča už existuje." }
        val spec =
            KeyGenParameterSpec
                .Builder(alias, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setAttestationChallenge(challenge)
        if (biometric) {
            spec
                .setUserAuthenticationRequired(true)
                .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                .setInvalidatedByBiometricEnrollment(true)
        }
        KeyPairGenerator
            .getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
            .apply { initialize(spec.build()) }
            .generateKeyPair()
    }

    fun approvalSignature(prefix: String): Signature = initializedSignature("$prefix-approval")

    override fun signRequest(prefix: String, signingInput: String): String {
        val signature = initializedSignature("$prefix-auth")
        signature.update(JwsSigning.signingBytes(signingInput))
        return JwsSigning.compact(signingInput, signature.sign())
    }

    private fun initializedSignature(alias: String): Signature = Signature
        .getInstance("SHA256withECDSA")
        .apply {
            val privateKey =
                store.getKey(alias, null) as? java.security.PrivateKey
                    ?: error("Kľúč chýba. Je potrebné opätovné párovanie.")
            initSign(privateKey)
        }

    private fun publicJwk(alias: String): EcPublicJwk {
        val key = store.getCertificate(alias).publicKey as ECPublicKey

        fun coordinate(value: java.math.BigInteger): String {
            val raw = value.toByteArray()
            val unsigned = raw.takeLast(32).toByteArray()
            val fixed = ByteArray(32)
            unsigned.copyInto(fixed, 32 - unsigned.size)
            return Base64.getUrlEncoder().withoutPadding().encodeToString(fixed)
        }
        return EcPublicJwk(x = coordinate(key.w.affineX), y = coordinate(key.w.affineY))
    }

    private fun certificateChain(alias: String): List<String> =
        store.getCertificateChain(alias).map { Base64.getEncoder().encodeToString(it.encoded) }

    override fun delete(prefix: String) {
        store.deleteEntry("$prefix-approval")
        store.deleteEntry("$prefix-auth")
    }

    fun removeOrphaned(keepPrefix: String?) {
        val prefixes =
            store
                .aliases()
                .toList()
                .filter { it.startsWith("bio-") }
                .map { it.removeSuffix("-approval").removeSuffix("-auth") }
                .toSet()
        prefixes.filter { it != keepPrefix }.forEach(::delete)
    }
}
