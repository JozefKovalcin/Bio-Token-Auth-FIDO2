package sk.biotoken.android

import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricManager
import androidx.test.platform.app.InstrumentationRegistry
import java.security.KeyFactory
import java.security.KeyStore
import java.util.Base64
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import sk.biotoken.android.security.DeviceKeys

class DeviceKeysTest {
    @Test fun approvalKeyRequiresStrongBiometricPerUseAndRequestKeyIsSeparate() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        assumeTrue(
            BiometricManager.from(
                context
            ).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
                BiometricManager.BIOMETRIC_SUCCESS
        )
        val prefix = "bio-test-${UUID.randomUUID()}"
        val keys = DeviceKeys()
        try {
            val enrollment = keys.create(
                prefix,
                Base64.getUrlEncoder().withoutPadding().encodeToString(
                    ByteArray(32) {
                        it.toByte()
                    }
                )
            )
            assertTrue(enrollment.approvalAttestation.isNotEmpty())
            assertTrue(enrollment.authAttestation.isNotEmpty())
            assertFalse(enrollment.approvalPublicJwk == enrollment.authPublicJwk)
            val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val key = store.getKey("$prefix-approval", null)
            val info = KeyFactory.getInstance(
                key.algorithm,
                "AndroidKeyStore"
            ).getKeySpec(key, KeyInfo::class.java)
            assertTrue(info.isUserAuthenticationRequired)
            assertEquals(KeyProperties.AUTH_BIOMETRIC_STRONG, info.userAuthenticationType)
            assertTrue(info.userAuthenticationValidityDurationSeconds <= 0)
            var unsigned = false
            try {
                keys.approvalSignature(prefix).apply { update("unapproved".toByteArray()) }.sign()
            } catch (_: Exception) {
                unsigned = true
            }
            assertTrue("Unapproved signing must fail", unsigned)
        } finally {
            keys.delete(prefix)
        }
    }
}
