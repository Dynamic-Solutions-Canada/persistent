package ca.persistent.app.alarm

import org.junit.Assert.assertEquals
import org.junit.Test

class SessionMirrorTest {
    private val origin = "https://persistent.dynamic-solutions.ca"
    private val session = "persistent_auth=abc"

    @Test fun aFreshSessionCookieWins() {
        assertEquals("persistent_auth=new", SessionMirror.cookieToKeep("persistent_auth=new", session, origin, origin))
    }

    @Test fun anEmptyReadKeepsTheStoredCookieForTheSameOriginOnly() {
        assertEquals(session, SessionMirror.cookieToKeep(null, session, origin, origin))
        assertEquals(session, SessionMirror.cookieToKeep("other=1", session, origin, origin))
        assertEquals("", SessionMirror.cookieToKeep(null, session, origin, "https://other.example"))
        assertEquals("", SessionMirror.cookieToKeep(null, session, origin, ""))
    }

    @Test fun aSignOutCannotBeUndoneByTheFallback() {
        // cancelAll -> AlarmStore.clearSession empties both the cookie and its origin.
        assertEquals("", SessionMirror.cookieToKeep(null, stored = "", storedOrigin = "", origin = origin))
        assertEquals("", SessionMirror.cookieToKeep("", stored = "", storedOrigin = "", origin = origin))
    }
}
