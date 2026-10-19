package sk.biotoken.core

import java.net.InetAddress
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HttpMobileApiTest {
    @Test fun nativeContractUsesPostJsonWithoutBrowserCookiesAndNeverFollowsRedirects() = runTest {
        val certificate = HeldCertificate.Builder().commonName("localhost").addSubjectAlternativeName("127.0.0.1").build()
        val serverTls = HandshakeCertificates.Builder().heldCertificate(certificate).build()
        val clientTls = HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
        MockWebServer().use { server ->
            server.useHttps(serverTls.sslSocketFactory(), false)
            server.start(InetAddress.getByName("127.0.0.1"), 0)
            val origin = "https://127.0.0.1:${server.port}"
            val api = HttpMobileApi(
                TrustedService(origin),
                OkHttpClient.Builder()
                    .sslSocketFactory(clientTls.sslSocketFactory(), clientTls.trustManager)
                    .followRedirects(false).followSslRedirects(false).build()
            )
            server.enqueue(
                MockResponse().setHeader("Content-Type", "application/json")
                    .setHeader("Set-Cookie", "__Host-bio_session=forbidden; Secure; HttpOnly")
                    .setBody("""{"deviceId":"device","status":"ACTIVE"}""")
            )
            assertEquals("ACTIVE", api.deviceStatus(ProofRequest("challenge", "signed-proof")).status)
            val first = server.takeRequest()
            assertEquals("/api/mobile/devices/status", first.path)
            assertEquals("POST", first.method)
            assertEquals("""{"challengeId":"challenge","proofJws":"signed-proof"}""", first.body.readUtf8())
            assertNull(first.getHeader("Origin"))
            assertNull(first.getHeader("Cookie"))
            server.enqueue(MockResponse().setResponseCode(307).setHeader("Location", "https://attacker.example/"))
            var rejected = false
            try {
                api.deviceStatus(ProofRequest("other", "proof"))
            } catch (failure: MobileApiException) {
                assertEquals(307, failure.statusCode)
                rejected = true
            }
            assertTrue(rejected)
            assertNull(server.takeRequest().getHeader("Cookie"))
        }
    }
}
