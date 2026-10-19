package sk.biotoken.android

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import sk.biotoken.android.security.DeviceKeys
import sk.biotoken.android.security.DeviceStore
import sk.biotoken.core.JwsSigning
import sk.biotoken.core.TrustedService

class MainActivity : FragmentActivity() {
    private val keys = DeviceKeys()
    private lateinit var model: ApprovalViewModel
    private var prompt: BiometricPrompt? = null
    private var operation: SigningOperation? = null
    private var requestedPairing = false
    private val cameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) model.scan(requestedPairing) else model.home()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        model =
            ViewModelProvider(
                this,
                object : ViewModelProvider.Factory {
                    @Suppress("UNCHECKED_CAST")
                    override fun <T : ViewModel> create(modelClass: Class<T>): T = ApprovalViewModel(
                        TrustedService(BuildConfig.SERVICE_ORIGIN),
                        keys,
                        DeviceStore(applicationContext)
                    ) as T
                }
            )[ApprovalViewModel::class.java]
        setContent {
            val state by model.state.collectAsStateWithLifecycle()
            MaterialTheme {
                if (state.screen == Screen.SCANNING_PAIRING ||
                    state.screen == Screen.SCANNING_LOGIN
                ) {
                    QrScanner(onScanned = model::scanned, onCancel = model::home)
                } else {
                    ApprovalScreen(
                        state = state,
                        onPair = { scan(true) },
                        onLogin = { scan(false) },
                        onAuthenticate = ::authenticate,
                        onReject = model::reject,
                        onRefresh = model::refreshDevice,
                        onHome = model::home,
                        onForget = model::forgetRevoked
                    )
                }
            }
        }
    }

    private fun scan(pairing: Boolean) {
        requestedPairing = pairing
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            model.scan(pairing)
        } else {
            cameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    private fun authenticate() {
        var signing: SigningOperation? = null
        try {
            signing = model.beginSignature() ?: return
            operation = signing
            if (BiometricManager.from(
                    this
                ).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) !=
                BiometricManager.BIOMETRIC_SUCCESS
            ) {
                model.biometricFailed(signing)
                return
            }
            val signature = keys.approvalSignature(signing.aliasPrefix)
            val captured = signing
            prompt =
                BiometricPrompt(
                    this,
                    ContextCompat.getMainExecutor(this),
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                            if (operation?.id != captured.id) return
                            operation = null
                            try {
                                val authorized = requireNotNull(result.cryptoObject?.signature)
                                authorized.update(JwsSigning.signingBytes(captured.signingInput))
                                val jws = JwsSigning.compact(
                                    captured.signingInput,
                                    authorized.sign()
                                )
                                model.signatureSucceeded(captured, jws)
                            } catch (failure: Exception) {
                                model.biometricFailed(
                                    captured,
                                    failure is KeyPermanentlyInvalidatedException
                                )
                            }
                        }

                        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                            if (operation?.id != captured.id) return
                            operation = null
                            model.biometricFailed(captured)
                        }
                    }
                )
            val info =
                BiometricPrompt.PromptInfo
                    .Builder()
                    .setTitle("Schváliť podpis pre Bio Token")
                    .setSubtitle(BuildConfig.SERVICE_ORIGIN)
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setNegativeButtonText("Zrušiť")
                    .setConfirmationRequired(true)
                    .build()
            prompt?.authenticate(info, BiometricPrompt.CryptoObject(signature))
        } catch (failure: Exception) {
            operation = null
            model.biometricFailed(signing, failure is KeyPermanentlyInvalidatedException)
        }
    }

    override fun onStop() {
        operation?.let {
            operation = null
            prompt?.cancelAuthentication()
            model.biometricFailed(it)
        }
        super.onStop()
    }
}
