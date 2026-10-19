package sk.biotoken.core

import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.impl.ECDSA
import com.nimbusds.jose.jwk.Curve
import com.nimbusds.jose.jwk.ECKey
import com.nimbusds.jose.util.Base64URL
import java.nio.charset.StandardCharsets
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Exact server bytes are signed. Nimbus supplies the standard DER -> JOSE conversion. */
object JwsSigning {
    fun signingBytes(signingInput: String): ByteArray {
        require(signingInput.length in 3..16384)
        val parts = signingInput.split('.')
        require(parts.size == 2 && parts.all { it.matches(Regex("[A-Za-z0-9_-]+")) })
        val header = JWSHeader.parse(Base64URL(parts[0]))
        require(header.algorithm == JWSAlgorithm.ES256)
        require(header.type?.toString() == "bio-mobile+jws")
        require(header.criticalParams.isNullOrEmpty() && header.isBase64URLEncodePayload)
        require(header.toJSONObject().keys == setOf("alg", "typ"))
        return signingInput.toByteArray(StandardCharsets.US_ASCII)
    }

    fun compact(signingInput: String, derSignature: ByteArray): String {
        signingBytes(signingInput)
        val joseSignature = ECDSA.transcodeSignatureToConcat(derSignature, 64)
        return "$signingInput.${Base64URL.encode(joseSignature)}"
    }

    fun validate(
        signingInput: String,
        origin: String,
        purpose: String,
        deviceId: String? = null,
        transactionId: String? = null,
        username: String? = null,
        expectedClaims: Map<String, String> = emptyMap(),
        now: Instant = Instant.now()
    ) {
        signingBytes(signingInput)
        val claims = Json.parseToJsonElement(Base64URL(signingInput.substringAfter('.')).decodeToString()).jsonObject
        fun claim(name: String) = claims[name]?.jsonPrimitive?.content
        require(claim("version") == "1" && claim("aud") == origin && claim("purpose") == purpose)
        require((claim("exp")?.toLongOrNull() ?: 0) > now.epochSecond)
        require(!claim("nonce").isNullOrBlank() && !claim("jti").isNullOrBlank())
        if (deviceId != null) require(claim("deviceId") == deviceId)
        if (transactionId != null) require(claim("transactionId") == transactionId)
        if (username != null) require(claim("username") == username)
        expectedClaims.forEach { (name, value) -> require(claim(name) == value) }
        val path = when (purpose) {
            "LOGIN_RESOLVE" -> "/api/mobile/auth/resolve"
            "LOGIN_REJECT" -> "/api/mobile/auth/reject"
            "DEVICE_STATUS" -> "/api/mobile/devices/status"
            else -> null
        }
        if (path != null) {
            val request = requireNotNull(claims["request"]?.jsonObject)
            require(request["method"]?.jsonPrimitive?.content == "POST")
            require(request["path"]?.jsonPrimitive?.content == path)
        }
    }

    fun thumbprint(jwk: EcPublicJwk): String {
        require(jwk.kty == "EC" && jwk.crv == "P-256")
        return ECKey.Builder(Curve.P_256, Base64URL(jwk.x), Base64URL(jwk.y))
            .build().computeThumbprint().toString()
    }
}
