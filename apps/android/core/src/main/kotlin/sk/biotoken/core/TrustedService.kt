package sk.biotoken.core

import java.net.URI
import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

class TrustedService(val origin: String) {
    init {
        val uri = URI(origin)
        require(uri.scheme == "https" && uri.host != null && uri.userInfo == null)
        require(uri.path.isNullOrEmpty() && uri.rawQuery == null && uri.rawFragment == null)
    }

    fun requireOrigin(candidate: String) {
        require(candidate == origin) { "Požiadavka patrí inému serveru." }
    }

    fun parseQr(raw: String, expectedType: String): String {
        require(raw.length in 1..4096) { "Neplatný QR kód." }
        val qr = Json.decodeFromString<QrPayload>(raw)
        require(qr.v == 1 && qr.type == expectedType) { "Nesprávny typ QR kódu." }
        requireOrigin(qr.origin)
        require(qr.token.matches(Regex("[A-Za-z0-9_-]{32,256}"))) { "Neplatný QR kód." }
        return qr.token
    }

    fun requireFresh(expiresAt: String, now: Instant = Instant.now()) {
        require(Instant.parse(expiresAt).isAfter(now)) { "Požiadavka vypršala. Začnite znova na PC." }
    }

    @Serializable
    private data class QrPayload(val v: Int, val type: String, val token: String, val origin: String)
}
