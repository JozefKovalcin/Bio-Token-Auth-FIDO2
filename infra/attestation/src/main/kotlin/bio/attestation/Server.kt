package bio.attestation

import com.android.keyattestation.verifier.*
import com.android.keyattestation.verifier.challengecheckers.ChallengeMatcher
import com.google.common.collect.ImmutableList
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.protobuf.ByteString
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.math.BigInteger
import java.net.InetSocketAddress
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.interfaces.ECPublicKey
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

private val gson = Gson()
private val b64 = Base64.getDecoder()
private val url64 = Base64.getUrlDecoder()
private val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build()
private const val VERIFIER_VERSION = "android/keyattestation@621149c4ebaeeea844d6f43098687c73c4d370a3"

data class PublicJwk(val kty: String, val crv: String, val x: String, val y: String)
data class VerifyInput(val challenge: String, val approvalPublicJwk: PublicJwk, val authPublicJwk: PublicJwk,
    val approvalAttestation: List<String>, val authAttestation: List<String>)

/** A bounded live fetch; all revoked AND suspended entries are denied. No stale-on-error fallback. */
private fun revokedSerials(): Set<String> {
    val request = HttpRequest.newBuilder(URI("https://android.googleapis.com/attestation/status"))
        .timeout(Duration.ofSeconds(8)).GET().build()
    val response = client.send(request, HttpResponse.BodyHandlers.ofInputStream())
    response.body().use { input ->
        check(response.statusCode() == 200)
        val bytes = input.readNBytes(1_048_577)
        check(bytes.size <= 1_048_576)
        val json = gson.fromJson(bytes.toString(Charsets.UTF_8), JsonObject::class.java)
        val entries = json.getAsJsonObject("entries") ?: error("Missing revocation entries")
        return entries.entrySet().map { entry ->
            check(entry.key.matches(Regex("[0-9a-f]+")))
            val status = entry.value.asJsonObject.get("status")?.asString
            check(status == "REVOKED" || status == "SUSPENDED")
            entry.key
        }.toSet()
    }
}

private fun requireConfig(name: String): String = System.getenv(name)?.takeIf { it.isNotBlank() }
    ?: error("Required configuration is missing: $name")

class AttestationService(private val expectedApp: AttestationApplicationId,
    private val revokedSource: () -> Set<String> = ::revokedSerials) {
    fun trustStatus(evidence: Map<String, String>): Map<String, Any> {
        require(evidence["verifier"] == VERIFIER_VERSION)
        val serials = evidence["certificateSerials"]?.split(',') ?: error("Missing serials")
        require(serials.size in 2..16 && serials.all { it.length in 1..256 && it.matches(Regex("[0-9a-f]+")) })
        val revoked = revokedSource()
        require(serials.none { it in revoked })
        return mapOf("trusted" to true)
    }
    fun verify(input: VerifyInput): Map<String, Any> {
        require(input.challenge.matches(Regex("[A-Za-z0-9_-]{43}")))
        val challenge = url64.decode(input.challenge)
        // Refresh once per enrollment; both keys are checked against the same fresh snapshot.
        val revoked = revokedSource()
        val approval = verifyKey(input.approvalAttestation, input.approvalPublicJwk, challenge, true, revoked)
        val auth = verifyKey(input.authAttestation, input.authPublicJwk, challenge, false, revoked)
        require(!approval.result.publicKey.encoded.contentEquals(auth.result.publicKey.encoded))
        return mapOf("verified" to true, "trustLevel" to "HARDWARE_ATTESTED", "evidence" to mapOf(
            "verifier" to VERIFIER_VERSION,
            "certificateSerials" to (approval.serials + auth.serials).joinToString(","),
            "approvalSecurityLevel" to approval.result.securityLevel.name, "authSecurityLevel" to auth.result.securityLevel.name,
            "verifiedBoot" to true, "applicationVerified" to true, "biometricPerUse" to true,
            "verifiedAt" to Instant.now().toString()))
    }

    private data class VerifiedKey(val result: VerificationResult.Success, val serials: Set<String>)
    private fun verifyKey(chainInput: List<String>, jwk: PublicJwk, challenge: ByteArray, approval: Boolean,
        revoked: Set<String>): VerifiedKey {
        require(chainInput.size in 2..8)
        val factory = CertificateFactory.getInstance("X.509")
        val chain = chainInput.map {
            require(it.length <= 16_384 && it.matches(Regex("[A-Za-z0-9+/]+={0,2}")))
            factory.generateCertificate(b64.decode(it).inputStream()) as X509Certificate
        }
        val config = ConstraintConfig(attestationApplicationId = AttestationApplicationIdConstraint.STRICT,
            additionalConstraints = ImmutableList.of(
                AttributeConstraint.STRICT("Bio Token key authorization policy", true) { ApprovalPolicy(approval).accepts(it) },
                SecurityLevelConstraint.MATCHES_CERTIFICATE))
        val verifier = Verifier(GoogleTrustAnchors, { revoked }, { Instant.now() }, expectedApp, config)
        val result = verifier.verify(chain, ChallengeMatcher(challenge))
        require(result is VerificationResult.Success)
        require(result.deviceLocked && result.verifiedBootState == VerifiedBootState.VERIFIED)
        val publicKey = result.publicKey as? ECPublicKey ?: error("Expected EC public key")
        require(jwk.kty == "EC" && jwk.crv == "P-256" && publicKey.params.curve.field.fieldSize == 256)
        require(jwk.x.matches(Regex("[A-Za-z0-9_-]{43}")) && jwk.y.matches(Regex("[A-Za-z0-9_-]{43}")))
        require(BigInteger(1, url64.decode(jwk.x)) == publicKey.w.affineX && BigInteger(1, url64.decode(jwk.y)) == publicKey.w.affineY)
        return VerifiedKey(result, chain.map { it.serialNumber.toString(16) }.toSet())
    }
}

private fun respond(exchange: HttpExchange, status: Int, body: Map<String, Any>) {
    val bytes = gson.toJson(body).toByteArray(Charsets.UTF_8)
    exchange.responseHeaders.set("Content-Type", "application/json")
    exchange.responseHeaders.set("Cache-Control", "no-store")
    exchange.sendResponseHeaders(status, bytes.size.toLong())
    exchange.responseBody.use { it.write(bytes) }
    exchange.close()
}

fun main() {
    val secret = requireConfig("ATTESTATION_SERVICE_TOKEN")
    require(secret.length >= 32)
    val packageName = requireConfig("ATTESTATION_PACKAGE_NAME")
    val digest = requireConfig("ATTESTATION_SIGNING_CERT_SHA256").replace(":", "").lowercase()
    require(digest.matches(Regex("[0-9a-f]{64}")))
    val minVersion = (System.getenv("ATTESTATION_MIN_APP_VERSION") ?: "1").toBigInteger()
    require(minVersion >= BigInteger.ONE)
    val signatureBytes = digest.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    val service = AttestationService(AttestationApplicationId(
        setOf(AttestationPackageInfo(packageName, minVersion)), setOf(ByteString.copyFrom(signatureBytes))))
    val server = HttpServer.create(InetSocketAddress("0.0.0.0", 8081), 16)
    server.executor = ThreadPoolExecutor(2, 4, 30, TimeUnit.SECONDS, ArrayBlockingQueue(16), ThreadPoolExecutor.AbortPolicy())
    server.createContext("/health") { exchange ->
        if (exchange.requestMethod == "GET" && exchange.requestURI.path == "/health") respond(exchange, 200, mapOf("status" to "ok"))
        else respond(exchange, 404, mapOf("error" to "Not found"))
    }
    val verifyHandler = com.sun.net.httpserver.HttpHandler { exchange ->
        try {
            val received = exchange.requestHeaders.getFirst("Authorization") ?: ""
            val authorized = MessageDigest.isEqual(received.toByteArray(), "Bearer $secret".toByteArray())
            if (!authorized) respond(exchange, 401, mapOf("error" to "Unauthorized"))
            else if (exchange.requestMethod != "POST" || exchange.requestURI.path !in setOf("/verify", "/trust-status") ||
                exchange.requestHeaders.getFirst("Content-Type")?.substringBefore(';') != "application/json") respond(exchange, 400, mapOf("error" to "Invalid request"))
            else {
                val bytes = exchange.requestBody.use { it.readNBytes(196_609) }
                if (bytes.size > 196_608) respond(exchange, 413, mapOf("error" to "Request too large"))
                else {
                    if (exchange.requestURI.path == "/verify") {
                        val input = gson.fromJson(bytes.toString(Charsets.UTF_8), VerifyInput::class.java)
                        respond(exchange, 200, service.verify(input))
                    } else {
                        val root = gson.fromJson(bytes.toString(Charsets.UTF_8), JsonObject::class.java)
                        val evidence = root.getAsJsonObject("evidence") ?: error("Missing evidence")
                        val fields = evidence.entrySet().associate { it.key to it.value.asString }
                        respond(exchange, 200, service.trustStatus(fields))
                    }
                }
            }
        } catch (_: Exception) {
            // Do not log untrusted certificate chains, request payloads or capabilities.
            respond(exchange, 401, mapOf("error" to "Attestation verification failed"))
        }
    }
    server.createContext("/verify", verifyHandler)
    server.createContext("/trust-status", verifyHandler)
    Runtime.getRuntime().addShutdownHook(Thread { server.stop(1) })
    server.start()
}
