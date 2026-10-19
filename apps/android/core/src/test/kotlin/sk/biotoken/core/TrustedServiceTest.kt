package sk.biotoken.core

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class TrustedServiceTest {
    private val service = TrustedService("https://bio-token.home.arpa")
    private val token = "a".repeat(43)

    @Test fun acceptsOnlyConfiguredOriginAndExplicitQrPurpose() {
        val qr = """{"v":1,"type":"login","origin":"https://bio-token.home.arpa","token":"$token"}"""
        assertEquals(token, service.parseQr(qr, "login"))
        assertThrows(IllegalArgumentException::class.java) { service.parseQr(qr, "pairing") }
        assertThrows(IllegalArgumentException::class.java) {
            service.parseQr(qr.replace("bio-token.home.arpa", "attacker.example"), "login")
        }
    }

    @Test fun refusesUrlCapabilitiesHttpAndInvalidOrigins() {
        listOf("http://example.com", "https://user@example.com", "https://example.com/path", "https://example.com?query=1").forEach {
            assertThrows(IllegalArgumentException::class.java) { TrustedService(it) }
        }
        assertThrows(Exception::class.java) { service.parseQr("https://bio-token.home.arpa?token=$token", "login") }
    }

    @Test fun expiryIsExclusiveAndServerRemainsAuthoritative() {
        val instant = Instant.parse("2026-10-19T10:00:00Z")
        assertThrows(IllegalArgumentException::class.java) { service.requireFresh(instant.toString(), instant) }
        service.requireFresh(instant.plusSeconds(1).toString(), instant)
    }
}
