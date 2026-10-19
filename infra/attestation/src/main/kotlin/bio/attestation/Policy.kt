package bio.attestation

import com.android.keyattestation.verifier.*
import java.math.BigInteger

/** Constraints inspect the maintained library's parsed model, never custom ASN.1. */
class ApprovalPolicy(private val approval: Boolean) {
    internal fun accepts(description: KeyDescription): Boolean {
        val hw = description.hardwareEnforced
        val sw = description.softwareEnforced
        val root = hw.rootOfTrust
        val validKey = hw.algorithms == BigInteger.valueOf(3) && hw.keySize == BigInteger.valueOf(256) &&
            hw.ecCurve == BigInteger.ONE && hw.purposes == setOf(BigInteger.valueOf(2)) &&
            hw.digests == setOf(BigInteger.valueOf(4))
        val validBoot = root?.deviceLocked == true && root.verifiedBootState == VerifiedBootState.VERIFIED
        val validAuth = if (approval) {
            // KeyMint HW_AUTH_FINGERPRINT=2 covers strong biometric authorization, never password=1.
            hw.userAuthType == BigInteger.valueOf(2) && hw.noAuthRequired != true &&
                (hw.authTimeout == null || hw.authTimeout == BigInteger.ZERO) &&
                sw.noAuthRequired != true && sw.userAuthType == null && sw.authTimeout == null
        } else {
            hw.noAuthRequired == true && hw.userAuthType == null && hw.authTimeout == null
        }
        return validKey && validBoot && validAuth
    }
}
