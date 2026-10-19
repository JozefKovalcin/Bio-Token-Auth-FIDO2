package sk.biotoken.core

import com.nimbusds.jose.JWSObject
import com.nimbusds.jose.crypto.ECDSAVerifier
import com.nimbusds.jose.crypto.impl.ECDSA
import com.nimbusds.jose.jwk.ECKey
import com.nimbusds.jose.util.Base64URL
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class JwsSigningTest {
    private fun input(payload: String, header: String = """{"alg":"ES256","typ":"bio-mobile+jws"}"""): String =
        "${Base64URL.encode(header)}.${Base64URL.encode(payload)}"

    @Test fun signsEntireProtectedHeaderAndPayloadUsingStandardJoseSignature() {
        val pair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        val signingInput = input("""{"purpose":"LOGIN_APPROVE","value":"exact bytes"}""")
        val der = Signature.getInstance("SHA256withECDSA").apply {
            initSign(pair.private)
            update(JwsSigning.signingBytes(signingInput))
        }.sign()
        val compact = JwsSigning.compact(signingInput, der)
        val jws = JWSObject.parse(compact)
        assertEquals(64, jws.signature.decode().size)
        assertTrue(jws.verify(ECDSAVerifier(pair.public as ECPublicKey)))
        val alteredPayload = "${compact.substringBefore('.')}.${Base64URL.encode("{}")}.${compact.substringAfterLast('.')}"
        val changed = JWSObject.parse(alteredPayload)
        assertFalse(changed.verify(ECDSAVerifier(pair.public as ECPublicKey)))
    }

    @Test fun validatesPurposeAudienceDeviceUsernameAndExpiryBeforeSigning() {
        val now = Instant.ofEpochSecond(1000)
        val payload =
            """{"version":1,"aud":"https://service.example","purpose":"LOGIN_APPROVE",""" +
                """"nonce":"nonce","jti":"id","exp":1100,"deviceId":"device",""" +
                """"transactionId":"tx","username":"alice"}"""
        val signingInput = input(payload)
        JwsSigning.validate(signingInput, "https://service.example", "LOGIN_APPROVE", "device", "tx", "alice", now = now)
        for ((old, new) in listOf("LOGIN_APPROVE" to "PAIRING_PROOF", "alice" to "bob", "1100" to "1000", "device" to "other")) {
            assertThrows(IllegalArgumentException::class.java) {
                JwsSigning.validate(
                    input(payload.replace(old, new)),
                    "https://service.example",
                    "LOGIN_APPROVE",
                    "device",
                    "tx",
                    "alice",
                    now = now
                )
            }
        }
    }

    @Test fun rejectsAlgorithmConfusionCriticalParametersAndUnrecognizedHeaders() {
        for (header in listOf(
            """{"alg":"none","typ":"bio-mobile+jws"}""",
            """{"alg":"ES256","typ":"JWT"}""",
            """{"alg":"ES256","typ":"bio-mobile+jws","jku":"https://attacker.example"}""",
            """{"alg":"ES256","typ":"bio-mobile+jws","b64":false,"crit":["b64"]}"""
        )) {
            assertThrows(Exception::class.java) { JwsSigning.signingBytes(input("{}", header)) }
        }
    }

    @Test fun nodeGeneratedJoseFixtureHasIdenticalAndroidEncodingAndValidSignature() {
        val fixture = Json.parseToJsonElement(requireNotNull(javaClass.getResource("/jws-node-fixture.json")).readText()).jsonObject
        val compact = fixture.getValue("compactJws").jsonPrimitive.content
        val parsed = JWSObject.parse(compact)
        val der = ECDSA.transcodeSignatureToDER(parsed.signature.decode())
        assertEquals(compact, JwsSigning.compact(compact.substringBeforeLast('.'), der))
        val publicKey = ECKey.parse(fixture.getValue("publicJwk").toString())
        assertTrue(parsed.verify(ECDSAVerifier(publicKey)))
    }
}
