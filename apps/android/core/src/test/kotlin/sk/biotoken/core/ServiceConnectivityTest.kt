package sk.biotoken.core

import java.io.Closeable
import java.io.IOException
import java.net.ConnectException
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import kotlinx.coroutines.test.runTest
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ServiceConnectivityTest {
    @Test fun publicProbeUsesFixedGetWithoutCookiesAuthQrOrCReleaseGate() = runTest {
        Fixture().use { fixture ->
            val cookieJar = object : CookieJar {
                override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) = Unit
                override fun loadForRequest(url: HttpUrl) =
                    listOf(Cookie.Builder().name("secret").value("must-not-send").hostOnlyDomain(url.host).build())
            }
            val checker = fixture.checker(fixture.client.newBuilder().cookieJar(cookieJar).build())
            repeat(2) {
                fixture.server.enqueue(
                    MockResponse().setHeader("Content-Type", "application/json")
                        .setHeader("Set-Cookie", "secret=must-not-store; Secure")
                        .setBody("""{"status":"ok","modes":["A"]}""")
                )
                assertEquals(ServiceConnectionResult.REACHABLE, checker.check())
                val request = fixture.server.takeRequest()
                assertEquals("GET", request.method)
                assertEquals("/api/health", request.path)
                assertEquals(0L, request.bodySize)
                assertNull(request.getHeader("Authorization"))
                assertNull(request.getHeader("Cookie"))
                assertNull(request.getHeader("Origin"))
            }
        }
    }

    @Test fun redirectsAndAuthenticationChallengesAreNotFollowed() = runTest {
        Fixture().use { fixture ->
            fixture.server.enqueue(MockResponse().setResponseCode(307).setHeader("Location", "/other"))
            assertEquals(ServiceConnectionResult.HTTP_FAILURE, fixture.checker().check())
            assertEquals(1, fixture.server.requestCount)
            fixture.server.enqueue(MockResponse().setResponseCode(401).setHeader("WWW-Authenticate", "Basic"))
            assertEquals(ServiceConnectionResult.HTTP_FAILURE, fixture.checker().check())
            assertEquals(2, fixture.server.requestCount)
        }
    }

    @Test fun unknownCertificateIsReportedWithoutBypassingTls() = runTest {
        Fixture().use { fixture ->
            assertEquals(ServiceConnectionResult.TLS_FAILURE, fixture.checker(OkHttpClient()).check())
            assertEquals(0, fixture.server.requestCount)
        }
    }

    @Test fun trustedCertificateForAnotherHostnameIsRejected() = runTest {
        Fixture(validHostname = false).use { fixture ->
            assertEquals(ServiceConnectionResult.TLS_IDENTITY_FAILURE, fixture.checker().check())
            assertEquals(0, fixture.server.requestCount)
        }
    }

    @Test fun malformedHtmlAndOversizedResponsesNeverCountAsApiSuccess() = runTest {
        Fixture().use { fixture ->
            val cases = listOf(
                MockResponse().setHeader("Content-Type", "application/json").setBody("untrusted-secret"),
                MockResponse().setHeader("Content-Type", "text/html").setBody("""{"status":"ok"}"""),
                MockResponse().setHeader("Content-Type", "application/json").setBody("""{"status":"not-ok"}"""),
                MockResponse().setHeader("Content-Type", "application/json").setBody("x".repeat(8193)),
                MockResponse().setHeader("Content-Type", "application/json").setChunkedBody("x".repeat(8193), 100)
            )
            for (response in cases) {
                fixture.server.enqueue(response)
                assertEquals(ServiceConnectionResult.INVALID_RESPONSE, fixture.checker().check())
            }
        }
    }

    @Test fun dnsTimeoutConnectionAndOtherNetworkFailuresHaveFixedClassifications() = runTest {
        val failures = listOf(
            UnknownHostException("untrusted-sensitive-message") to ServiceConnectionResult.DNS_FAILURE,
            SocketTimeoutException("untrusted-sensitive-message") to ServiceConnectionResult.TIMEOUT,
            ConnectException("untrusted-sensitive-message") to ServiceConnectionResult.CONNECTION_FAILURE,
            IOException("untrusted-sensitive-message") to ServiceConnectionResult.NETWORK_FAILURE
        )
        for ((failure, expected) in failures) {
            val client = OkHttpClient.Builder().addInterceptor { throw failure }.build()
            assertEquals(expected, HttpServiceConnectivity(TrustedService("https://configured.invalid"), client).check())
        }
    }

    private class Fixture(validHostname: Boolean = true) : Closeable {
        val server = MockWebServer()
        val client: OkHttpClient
        init {
            val builder = HeldCertificate.Builder().commonName("probe-test")
            builder.addSubjectAlternativeName(if (validHostname) "127.0.0.1" else "different.invalid")
            val certificate = builder.build()
            val serverTls = HandshakeCertificates.Builder().heldCertificate(certificate).build()
            val clientTls = HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
            server.useHttps(serverTls.sslSocketFactory(), false)
            server.start(InetAddress.getByName("127.0.0.1"), 0)
            client = OkHttpClient.Builder().sslSocketFactory(clientTls.sslSocketFactory(), clientTls.trustManager).build()
        }

        fun checker(client: OkHttpClient = this.client) =
            HttpServiceConnectivity(TrustedService("https://127.0.0.1:${server.port}"), client)

        override fun close() = server.close()
    }
}
