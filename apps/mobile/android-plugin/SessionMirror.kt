package ca.persistent.app.alarm

/**
 * Decides which session cookie the background worker keeps (contract gap #11). The WebView
 * mirrors the HttpOnly `persistent_auth` cookie into [AlarmStore] because the worker's process
 * has no WebView to read it from; see AlarmPlugin.setSyncConfig.
 *
 * Pure so the JVM tests can cover it: no Android types.
 */
object SessionMirror {
    private const val SESSION_COOKIE = "persistent_auth="

    /**
     * The cookie to store after a fresh read.
     *
     * A fresh read that carries the session wins. An empty read keeps the stored cookie only for
     * the same API origin, which covers a cookie-jar flush that has not landed yet without letting
     * a cookie travel to another server. After a sign-out [AlarmStore.clearSession] has emptied
     * the stored cookie, so this fallback can never bring a signed-out session back.
     *
     * @param fresh the Cookie header CookieManager returned for [origin], or null.
     * @param stored the cookie currently mirrored, "" when none.
     * @param storedOrigin the API origin [stored] was captured for, "" when none.
     * @param origin the API origin of this read.
     */
    fun cookieToKeep(fresh: String?, stored: String, storedOrigin: String, origin: String): String {
        if (fresh != null && fresh.contains(SESSION_COOKIE)) return fresh
        return if (stored.isNotEmpty() && origin.isNotEmpty() && storedOrigin == origin) stored else ""
    }
}
