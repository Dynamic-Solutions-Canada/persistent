package ca.persistent.app.alarm

/** Decode server-authoritative UTF-16 ranges without interpreting user text as a template. */
internal object PushBodyRange {
    /** Null keeps the legacy display verbatim; empty means a valid escalation with no user body. */
    fun extract(body: String, encoded: String?): String? {
        if (encoded == null || !encoded.matches(Regex("[0-9]+:[0-9]+"))) return null
        val parts = encoded.split(':')
        val start = parts[0].toIntOrNull() ?: return null
        val length = parts[1].toIntOrNull() ?: return null
        if (start > body.length || length > body.length - start) return null
        val end = start + length
        if (splitsSurrogate(body, start) || splitsSurrogate(body, end)) return null
        return body.substring(start, end)
    }

    private fun splitsSurrogate(body: String, index: Int): Boolean =
        index > 0 && index < body.length &&
            Character.isHighSurrogate(body[index - 1]) && Character.isLowSurrogate(body[index])
}
