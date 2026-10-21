package ca.persistent.app.alarm

import java.util.Locale

/** Pure matching policy, mirroring the canonical supported identities without crossing script boundaries. */
internal object LocaleMatcher {
    val supported = listOf("en-US", "en-CA", "es-ES", "fr-FR", "fr-CA", "de-DE", "zh-CN", "pt-BR", "ja-JP")

    fun normalize(value: String?): String? = supported.firstOrNull { it.equals(value?.trim(), ignoreCase = true) }

    /** Android 13's system picker supersedes a private mirror, including reset to Match device. */
    fun applicationOverride(systemManaged: Boolean, applicationPreferences: List<String>, stored: String?): String? {
        if (!systemManaged) return normalize(stored)
        return if (applicationPreferences.isEmpty()) null else resolve(applicationPreferences)
    }

    /** Only the first upgrade can migrate a private/web choice into an empty OS preference. */
    fun migrationChoice(applicationPreferences: List<String>, stored: String?, fallback: String?): String? {
        if (applicationPreferences.isNotEmpty()) return null
        return normalize(stored) ?: normalize(fallback)
    }

    /** Pre-13 upgrades import web storage once, preserving an existing native Match device reset. */
    fun privateMigrationChoice(initialized: Boolean, hasNativeMirror: Boolean, fallback: String?): String? {
        if (initialized || hasNativeMirror) return null
        return normalize(fallback)
    }

    fun resolve(preferences: List<String>, override: String? = null): String {
        normalize(override)?.let { return it }
        for (tag in preferences) {
            val locale = try { Locale.Builder().setLanguageTag(tag).build() } catch (_: Exception) { continue }
            val script = if (locale.script == "Latn" && locale.language in listOf("en", "es", "fr", "de", "pt")) "" else locale.script
            normalize(listOf(locale.language, script, locale.country).filter { it.isNotEmpty() }.joinToString("-"))?.let { return it }
            supported.firstOrNull { family(Locale.forLanguageTag(it)) == family(locale) }?.let { return it }
        }
        return "en-US"
    }

    private fun family(locale: Locale): String {
        if (locale.language == "zh") {
            val script = locale.script.ifEmpty { if (locale.country in listOf("TW", "HK", "MO")) "Hant" else "Hans" }
            return "zh-$script"
        }
        val script = locale.script
        return if (script.isEmpty() || script == "Latn" && locale.language in listOf("en", "es", "fr", "de", "pt")) locale.language else "${locale.language}-$script"
    }
}
