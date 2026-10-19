package sk.biotoken.core

import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.CookieJar
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class MobileApiException(val statusCode: Int) :
    IOException(
        when (statusCode) {
            409 -> "Požiadavka už bola použitá alebo vypršala. Začnite znova na PC."
            503 -> "Režim C zatiaľ nie je povolený alebo zariadenie nespĺňa bezpečnostnú politiku."
            429 -> "Príliš veľa pokusov. Skúste neskôr."
            else -> "Server odmietol požiadavku. Overte spárovanie a skúste znova."
        }
    )

class HttpMobileApi internal constructor(service: TrustedService, private val client: OkHttpClient) : MobileApi {
    constructor(service: TrustedService) : this(
        service,
        OkHttpClient.Builder()
            .cookieJar(CookieJar.NO_COOKIES)
            .followRedirects(false)
            .followSslRedirects(false)
            .callTimeout(java.time.Duration.ofSeconds(20))
            .build()
    )
    private val origin = service.origin
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private suspend inline fun <reified I, reified O> post(path: String, body: I): O = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(origin + path)
            .header("Accept", "application/json")
            .header("Cache-Control", "no-store")
            .post(json.encodeToString(body).toRequestBody("application/json".toMediaType()))
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw MobileApiException(response.code)
            val responseBody = response.body ?: throw IOException("Prázdna odpoveď servera.")
            if (responseBody.contentLength() > 65536) throw IOException("Neplatná odpoveď servera.")
            val source = responseBody.source()
            source.request(65537)
            val bytes = source.readByteArray(minOf(source.buffer.size, 65537))
            if (bytes.size > 65536) throw IOException("Neplatná odpoveď servera.")
            json.decodeFromString<O>(bytes.toString(Charsets.UTF_8))
        }
    }

    override suspend fun pairingResolve(request: PairingResolveRequest): PairingResolved = post("/api/mobile/pairings/resolve", request)
    override suspend fun pairingCandidate(request: PairingCandidateRequest): PairingCandidate =
        post("/api/mobile/pairings/candidate", request)
    override suspend fun pairingProve(request: PairingProveRequest): PairingProved = post("/api/mobile/pairings/prove", request)
    override suspend fun deviceChallenge(request: DeviceChallengeRequest): SigningChallenge = post("/api/mobile/devices/challenge", request)
    override suspend fun deviceStatus(request: ProofRequest): DeviceStatus = post("/api/mobile/devices/status", request)
    override suspend fun authChallenge(request: MobileChallengeRequest): SigningChallenge = post("/api/mobile/auth/challenge", request)
    override suspend fun resolve(request: ProofRequest): LoginDetails = post("/api/mobile/auth/resolve", request)
    override suspend fun approve(request: ApprovalRequest): OperationStatus = post("/api/mobile/auth/approve", request)
    override suspend fun reject(request: ProofRequest): OperationStatus = post("/api/mobile/auth/reject", request)
}
