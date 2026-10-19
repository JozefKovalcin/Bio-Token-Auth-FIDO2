package sk.biotoken.android

import android.content.Intent
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.security.KeyStoreException
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.security.keystore.UserNotAuthenticatedException
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import java.security.KeyFactory
import java.security.KeyStore
import java.security.PublicKey
import java.security.SecureRandom
import java.security.Signature
import java.util.Base64
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assume.assumeTrue
import org.junit.Test
import sk.biotoken.android.security.DeviceKeys

/** Offline local hardware evidence only: no server challenge, pairing, account, session or JWS. */
class OfflineBiometricPromptTest {
    @Test fun realCryptoObjectSignsOnceAndExplicitCancelDoesNotSign() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        assumeTrue(
            instrumentation is OfflineBiometricRunner &&
                InstrumentationRegistry.getArguments().getString(OfflineBiometricRunner.OPT_IN) == "true"
        )
        val keys = DeviceKeys()
        val prefix = "bio-test-${UUID.randomUUID()}"
        var failure: Outcome? = null
        try {
            val context = instrumentation.targetContext
            val manager = context.getSystemService(BiometricManager::class.java)
            requireOutcome(
                manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
                    BiometricManager.BIOMETRIC_SUCCESS,
                Outcome.FAIL_STRONG_BIOMETRIC_UNAVAILABLE
            )
            keys.create(prefix, Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes()))
            val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val privateKey = store.getKey("$prefix-approval", null)
            val info = KeyFactory.getInstance(privateKey.algorithm, "AndroidKeyStore")
                .getKeySpec(privateKey, KeyInfo::class.java)
            requireOutcome(
                info.isUserAuthenticationRequired &&
                    info.userAuthenticationType == KeyProperties.AUTH_BIOMETRIC_STRONG &&
                    info.userAuthenticationValidityDurationSeconds <= 0 &&
                    info.isUserAuthenticationRequirementEnforcedBySecureHardware &&
                    info.purposes == KeyProperties.PURPOSE_SIGN &&
                    info.keySize == 256 &&
                    info.origin == KeyProperties.ORIGIN_GENERATED &&
                    info.digests.toSet() == setOf(KeyProperties.DIGEST_SHA256),
                Outcome.FAIL_KEY_POLICY
            )
            @Suppress("DEPRECATION")
            val hardware = if (Build.VERSION.SDK_INT >= 31) {
                info.securityLevel in setOf(KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT, KeyProperties.SECURITY_LEVEL_STRONGBOX)
            } else {
                info.isInsideSecureHardware
            }
            requireOutcome(hardware, Outcome.FAIL_KEY_HARDWARE)
            val publicKey = store.getCertificate("$prefix-approval").publicKey
            requireAuthenticationDenial(keys, prefix, Outcome.FAIL_SIGN_WITHOUT_AUTH)
            val intent = Intent(context, ComponentActivity::class.java)
            ActivityScenario.launch<ComponentActivity>(intent).use { scenario ->
                runPrompt(scenario, keys, prefix, publicKey, expectCancel = false)
                report(Outcome.PASS_SIGNATURE_VERIFIED)
                requireAuthenticationDenial(keys, prefix, Outcome.FAIL_PER_USE)
                report(Outcome.PASS_PER_USE)
                runPrompt(scenario, keys, prefix, publicKey, expectCancel = true)
                requireAuthenticationDenial(keys, prefix, Outcome.FAIL_CANCEL_AUTHORIZED)
                report(Outcome.PASS_CANCELLED_NO_SIGNATURE)
            }
        } catch (known: OfflineFailure) {
            failure = known.outcome
        } catch (_: Throwable) {
            // Never include platform messages, key aliases, certificates or cryptographic bytes.
            failure = Outcome.FAIL_LOCAL_SETUP
        } finally {
            try {
                // Only these two fresh UUID aliases, never DeviceStore or another alias.
                keys.delete(prefix)
            } catch (_: Throwable) {
                failure = Outcome.FAIL_CLEANUP
            }
        }
        report(failure ?: Outcome.PASS)
        failure?.let { throw AssertionError(it.name) }
    }

    private fun runPrompt(
        scenario: ActivityScenario<ComponentActivity>,
        keys: DeviceKeys,
        prefix: String,
        publicKey: PublicKey,
        expectCancel: Boolean
    ) {
        val host = AtomicReference<PromptHost>()
        try {
            scenario.onActivity { activity ->
                host.set(PromptHost(activity, keys, prefix, publicKey, expectCancel).apply { show() })
            }
            val result = host.get().awaitResult()
            requireOutcome(
                result == if (expectCancel) Outcome.PASS_CANCELLED_NO_SIGNATURE else Outcome.PASS_SIGNATURE_VERIFIED,
                result
            )
        } finally {
            scenario.onActivity { host.get()?.close() }
        }
    }

    private class PromptHost(
        private val activity: ComponentActivity,
        private val keys: DeviceKeys,
        private val prefix: String,
        private val publicKey: PublicKey,
        private val expectCancel: Boolean
    ) {
        private val result = AtomicReference<Outcome?>()
        private val done = CountDownLatch(1)
        private val payload = "BIO-TOKEN-OFFLINE-LOCAL-TEST-v1:".toByteArray() + randomBytes()
        private var cancellation: CancellationSignal? = null
        private lateinit var button: Button
        private lateinit var status: TextView
        private val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) {
                finish(Outcome.FAIL_LIFECYCLE)
                cancellation?.cancel()
            }
        }

        fun show() {
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            activity.lifecycle.addObserver(observer)
            status = TextView(activity).apply {
                text = if (expectCancel) {
                    "Lokálny test 2/2: po kliknutí v systémovom dialógu zvoľte Zrušiť. Nepoužite odtlačok."
                } else {
                    "Lokálny test 1/2: po kliknutí potvrďte systémový dialóg zapísaným silným odtlačkom."
                }
            }
            button = Button(activity).apply {
                text = if (expectCancel) "Spustiť test zrušenia" else "Spustiť test odtlačku"
                setOnClickListener {
                    isEnabled = false
                    startPrompt()
                }
            }
            activity.setContentView(
                LinearLayout(activity).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(32, 64, 32, 32)
                    addView(status)
                    addView(button)
                }
            )
        }

        private fun startPrompt() {
            try {
                val signature = keys.approvalSignature(prefix)
                val signal = CancellationSignal().also { cancellation = it }
                val prompt = BiometricPrompt.Builder(activity)
                    .setTitle("Bio Token: iba lokálny test")
                    .setSubtitle(if (expectCancel) "Zvoľte Zrušiť, nepoužite odtlačok" else "Potvrďte zapísaným silným odtlačkom")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setConfirmationRequired(true)
                    .setNegativeButton("Zrušiť", activity.mainExecutor) { _, _ ->
                        finish(if (expectCancel) Outcome.PASS_CANCELLED_NO_SIGNATURE else Outcome.FAIL_UNEXPECTED_CANCEL)
                    }
                    .build()
                prompt.authenticate(
                    BiometricPrompt.CryptoObject(signature),
                    signal,
                    activity.mainExecutor,
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(auth: BiometricPrompt.AuthenticationResult) {
                            if (result.get() != null) return
                            if (expectCancel) {
                                // A mistaken approval is a failure; do not sign in the cancel scenario.
                                finish(Outcome.FAIL_UNEXPECTED_APPROVAL)
                                return
                            }
                            try {
                                val authorized = auth.cryptoObject?.signature
                                requireOutcome(
                                    auth.authenticationType == BiometricPrompt.AUTHENTICATION_RESULT_TYPE_BIOMETRIC &&
                                        authorized === signature,
                                    Outcome.FAIL_CRYPTO_OBJECT
                                )
                                requireNotNull(authorized).update(payload)
                                val signed = authorized.sign()
                                try {
                                    val verifier = Signature.getInstance("SHA256withECDSA").apply {
                                        initVerify(publicKey)
                                        update(payload)
                                    }
                                    finish(if (verifier.verify(signed)) Outcome.PASS_SIGNATURE_VERIFIED else Outcome.FAIL_SIGNATURE_VERIFY)
                                } finally {
                                    signed.fill(0)
                                }
                            } catch (known: OfflineFailure) {
                                finish(known.outcome)
                            } catch (_: Throwable) {
                                finish(Outcome.FAIL_SIGNATURE_VERIFY)
                            }
                        }

                        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                            // The explicit negative-button callback alone passes the cancel scenario.
                            finish(Outcome.FAIL_PROMPT_ERROR)
                        }

                        override fun onAuthenticationFailed() {
                            // Do not repeat bad biometric attempts or attempt to induce lockout.
                            finish(Outcome.FAIL_BIOMETRIC_REJECTED)
                            signal.cancel()
                        }
                    }
                )
            } catch (_: Throwable) {
                finish(Outcome.FAIL_PROMPT_START)
            }
        }

        private fun finish(outcome: Outcome) {
            if (result.compareAndSet(null, outcome)) {
                status.text = outcome.name
                button.isEnabled = false
                done.countDown()
            }
        }

        fun awaitResult(): Outcome = if (done.await(180, TimeUnit.SECONDS)) {
            result.get() ?: Outcome.FAIL_LOCAL_SETUP
        } else {
            Outcome.FAIL_TIMEOUT
        }

        fun close() {
            activity.lifecycle.removeObserver(observer)
            finish(Outcome.FAIL_LIFECYCLE)
            cancellation?.cancel()
            payload.fill(0)
        }
    }

    private enum class Outcome {
        PASS,
        PASS_SIGNATURE_VERIFIED,
        PASS_PER_USE,
        PASS_CANCELLED_NO_SIGNATURE,
        FAIL_STRONG_BIOMETRIC_UNAVAILABLE,
        FAIL_KEY_POLICY,
        FAIL_KEY_HARDWARE,
        FAIL_SIGN_WITHOUT_AUTH,
        FAIL_PER_USE,
        FAIL_CANCEL_AUTHORIZED,
        FAIL_UNEXPECTED_CANCEL,
        FAIL_UNEXPECTED_APPROVAL,
        FAIL_CRYPTO_OBJECT,
        FAIL_SIGNATURE_VERIFY,
        FAIL_PROMPT_ERROR,
        FAIL_BIOMETRIC_REJECTED,
        FAIL_PROMPT_START,
        FAIL_TIMEOUT,
        FAIL_LIFECYCLE,
        FAIL_LOCAL_SETUP,
        FAIL_AUTH_DENIAL_UNCLASSIFIED,
        FAIL_CLEANUP
    }

    private class OfflineFailure(val outcome: Outcome) : RuntimeException()

    companion object {
        private fun randomBytes(): ByteArray = ByteArray(32).also { SecureRandom().nextBytes(it) }

        private fun requireOutcome(condition: Boolean, failure: Outcome) {
            if (!condition) throw OfflineFailure(failure)
        }

        private fun requireAuthenticationDenial(keys: DeviceKeys, prefix: String, failure: Outcome) {
            try {
                keys.approvalSignature(prefix).apply { update(randomBytes()) }.sign().fill(0)
            } catch (problem: Exception) {
                val causes = generateSequence<Throwable>(problem) { it.cause }.take(8)
                val denied = causes.any {
                    it is UserNotAuthenticatedException ||
                        (
                            Build.VERSION.SDK_INT >= 33 &&
                                it is KeyStoreException &&
                                it.numericErrorCode == KeyStoreException.ERROR_USER_AUTHENTICATION_REQUIRED
                            )
                }
                requireOutcome(denied, Outcome.FAIL_AUTH_DENIAL_UNCLASSIFIED)
                return
            }
            throw OfflineFailure(failure)
        }

        private fun report(outcome: Outcome) {
            InstrumentationRegistry.getInstrumentation().sendStatus(
                0,
                Bundle().apply { putString(OfflineBiometricRunner.RESULT, outcome.name) }
            )
        }
    }
}
