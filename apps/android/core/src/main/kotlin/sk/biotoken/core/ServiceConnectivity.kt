package sk.biotoken.core

import java.io.IOException
import java.io.InterruptedIOException
import java.net.ConnectException
import java.net.UnknownHostException
import java.time.Duration
import javax.net.ssl.SSLException
import javax.net.ssl.SSLPeerUnverifiedException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.CookieJar
import okhttp3.OkHttpClient
import okhttp3.Request

/** Fixed classifications only: never return an exception, response body or credential. */
enum class ServiceConnectionResult {
    REACHABLE,
    DNS_FAILURE,
    TLS_IDENTITY_FAILURE,
    TLS_FAILURE,
    TIMEOUT,
    CONNECTION_FAILURE,
    HTTP_FAILURE,
    INVALID_RESPONSE,
    NETWORK_FAILURE
}

fun interface ServiceConnectivity {
    suspend fun check(): ServiceConnectionResult
}

/** A public health request is independent of C availability, pairing, QR and device keys. */
class HttpServiceConnectivity internal constructor(service: TrustedService, client: OkHttpClient) : ServiceConnectivity {
    constructor(service: TrustedService) : this(service, OkHttpClient())

    private val endpoint = service.origin + "/api/health"
    private val client = client.newBuilder()
        .cookieJar(CookieJar.NO_COOKIES)
        .authenticator(okhttp3.Authenticator.NONE)
        .proxyAuthenticator(okhttp3.Authenticator.NONE)
        .followRedirects(false)
        .followSslRedirects(false)
        .retryOnConnectionFailure(false)
        .connectTimeout(Duration.ofSeconds(5))
        .readTimeout(Duration.ofSeconds(5))
        .callTimeout(Duration.ofSeconds(10))
        .build()

    override suspend fun check(): ServiceConnectionResult = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(endpoint)
            .header("Accept", "application/json")
            .header("Cache-Control", "no-store")
            .get().build()
        try {
            client.newCall(request).execute().use { response ->
                if (response.code != 200) return@withContext ServiceConnectionResult.HTTP_FAILURE
                val body = response.body ?: return@withContext ServiceConnectionResult.INVALID_RESPONSE
                if (body.contentLength() > 8192 || body.contentType()?.let { "${it.type}/${it.subtype}" } != "application/json") {
                    return@withContext ServiceConnectionResult.INVALID_RESPONSE
                }
                val source = body.source()
                source.request(8193)
                val bytes = source.readByteArray(minOf(source.buffer.size, 8193))
                if (bytes.size > 8192) return@withContext ServiceConnectionResult.INVALID_RESPONSE
                val valid = try {
                    Json.parseToJsonElement(bytes.toString(Charsets.UTF_8)).jsonObject["status"]?.jsonPrimitive?.content == "ok"
                } catch (_: IllegalArgumentException) {
                    false
                }
                if (valid) ServiceConnectionResult.REACHABLE else ServiceConnectionResult.INVALID_RESPONSE
            }
        } catch (_: UnknownHostException) {
            ServiceConnectionResult.DNS_FAILURE
        } catch (_: SSLPeerUnverifiedException) {
            ServiceConnectionResult.TLS_IDENTITY_FAILURE
        } catch (_: SSLException) {
            ServiceConnectionResult.TLS_FAILURE
        } catch (_: InterruptedIOException) {
            ServiceConnectionResult.TIMEOUT
        } catch (_: ConnectException) {
            ServiceConnectionResult.CONNECTION_FAILURE
        } catch (_: IOException) {
            ServiceConnectionResult.NETWORK_FAILURE
        }
    }
}
