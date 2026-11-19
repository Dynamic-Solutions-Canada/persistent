package ca.persistent.app.alarm

import java.net.URI

/**
 * Decides whether a URL may be opened in the system browser by AlarmPlugin.openInBrowser (A2):
 * only the app's own origin, so the page can hand a same-origin page (the account export) to
 * the browser, and nothing else.
 *
 * Parsed with [URI], never compared as text, so `https://app.example@evil.example/` or a
 * relative or fragment-only value cannot pass for the app's origin. Pure, for the JVM tests.
 */
object OwnOriginUrl {
    private val LOOPBACK = setOf("localhost", "127.0.0.1", "[::1]", "::1")

    /**
     * The normalized URL to open, or null when [candidate] is not on [appUrl]'s origin.
     *
     * Rejected: anything that does not parse, relative or fragment-only values, user info
     * (`user:pass@`), a scheme or host or port other than the app's, and any scheme but https
     * (http only on a loopback host, for development).
     */
    fun allowed(candidate: String?, appUrl: String?): String? {
        if (candidate.isNullOrBlank() || appUrl.isNullOrBlank()) return null
        val url = parse(candidate) ?: return null
        val app = parse(appUrl) ?: return null
        if (!url.isAbsolute || url.isOpaque || url.rawUserInfo != null) return null
        val scheme = url.scheme?.lowercase() ?: return null
        val host = url.host?.lowercase() ?: return null
        val secure = scheme == "https" || (scheme == "http" && host in LOOPBACK)
        if (!secure) return null
        if (scheme != app.scheme?.lowercase()) return null
        if (host != app.host?.lowercase()) return null
        if (port(url) != port(app)) return null
        return url.toASCIIString()
    }

    private fun parse(value: String): URI? = runCatching { URI(value.trim()) }.getOrNull()

    /** The effective port, so `https://host` and `https://host:443` count as one origin. */
    private fun port(uri: URI): Int = when {
        uri.port != -1 -> uri.port
        uri.scheme?.lowercase() == "https" -> 443
        uri.scheme?.lowercase() == "http" -> 80
        else -> -1
    }
}
