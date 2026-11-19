package ca.persistent.app.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OwnOriginUrlTest {
    private val app = "https://persistent.dynamic-solutions.ca"

    @Test fun theAppsOwnPagesAreAllowed() {
        assertEquals("$app/settings#export", OwnOriginUrl.allowed("$app/settings#export", app))
        assertEquals("$app:443/settings", OwnOriginUrl.allowed("$app:443/settings", app))
        assertEquals("https://PERSISTENT.dynamic-solutions.ca/x", OwnOriginUrl.allowed("https://PERSISTENT.dynamic-solutions.ca/x", app))
    }

    @Test fun otherOriginsAndTricksAreRefused() {
        for (url in listOf(
            "https://evil.example/settings",
            "https://persistent.dynamic-solutions.ca.evil.example/",
            "https://persistent.dynamic-solutions.ca@evil.example/",
            "https://user:pass@persistent.dynamic-solutions.ca/settings",
            "http://persistent.dynamic-solutions.ca/settings",
            "https://persistent.dynamic-solutions.ca:8443/settings",
            "#export",
            "/settings",
            "javascript:alert(1)",
            "intent://persistent.dynamic-solutions.ca/#Intent;end",
            "file:///sdcard/x",
            "",
            "https://exa mple.com",
        )) {
            assertNull(url, OwnOriginUrl.allowed(url, app))
        }
        assertNull(OwnOriginUrl.allowed("$app/settings", null))
    }

    @Test fun plainHttpIsAllowedOnlyForALoopbackDevServer() {
        assertEquals("http://localhost:5173/settings", OwnOriginUrl.allowed("http://localhost:5173/settings", "http://localhost:5173"))
        assertNull(OwnOriginUrl.allowed("http://dev.example/settings", "http://dev.example"))
    }
}
