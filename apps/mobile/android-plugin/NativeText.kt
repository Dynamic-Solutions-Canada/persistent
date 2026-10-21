package ca.persistent.app.alarm

import android.content.Context
import android.text.format.DateFormat
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.util.Log
import org.json.JSONObject
import java.util.Locale
import java.util.WeakHashMap

/** Persisted presentation only. Application bindings never include editable or user-authored reminder text. */
internal object NativeText {
    private const val PREFS = "persistent_locale"
    private const val KEY = "locale"
    private val bodyBindings = WeakHashMap<TextView, AlarmSpec>()
    private val bindings = WeakHashMap<TextView, Pair<String, Map<String, Any>>>()
    private val catalogs = mutableMapOf<String, JSONObject>()
    private val placeholder = Regex("\\{\\{\\s*(\\w+)\\s*}}")

    /** Validate before replacing the display preference; it contains no credentials or reminder state. */
    fun save(context: Context, value: JSONObject): Boolean {
        require(value.optInt("version") == 1) { "Unsupported locale version" }
        val override = value.optString("languageOverride").takeUnless { it.isEmpty() || it == "null" }
        require(override == null || LocaleMatcher.normalize(override) != null) { "Unsupported language override" }
        require(value.optString("timeFormat") in listOf("12h", "24h")) { "Unsupported clock format" }
        require(LocaleMatcher.normalize(value.optString("resolvedLocale")) != null) { "Unsupported resolved locale" }
        require(value.opt("timeFormatChosen") is Boolean) { "Invalid explicit clock choice" }
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val formatting = value.optString("formattingLocale")
        val region = value.optString("formattingLocaleOverride").takeUnless { it.isEmpty() || it == "null" }
        require(formatting.isNotBlank() && formatting.length <= 100 && (region == null || region.length <= 100)) { "Invalid formatting locale" }
        NativeLanguage.apply(context, override)
        val raw = JSONObject()
            .put("version", 1)
            .put("languageOverride", override ?: JSONObject.NULL)
            .put("formattingLocaleOverride", region ?: JSONObject.NULL)
            .put("resolvedLocale", value.optString("resolvedLocale"))
            .put("formattingLocale", formatting)
            .put("timeFormat", value.optString("timeFormat"))
            .put("timeFormatChosen", value.optBoolean("timeFormatChosen"))
            .toString()
        if (prefs.getString(KEY, null) == raw) return false
        prefs.edit().putString(KEY, raw).apply()
        return true
    }

    private fun saved(context: Context): JSONObject = try {
        JSONObject(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "{}") ?: "{}")
    } catch (error: Exception) {
        Log.w("PersistLocale", "Saved display preferences could not be read", error)
        JSONObject()
    }

    /** Pre-13 storage and one-time upgrade migration only; Android 13+ reads its OS picker. */
    fun storedOverride(context: Context): String? = LocaleMatcher.normalize(saved(context).optString("languageOverride"))

    /** Older hosts had only web storage. Import its language once before publishing the native snapshot. */
    fun initializePrivateLanguage(context: Context, fallback: String?) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val initialized = prefs.getBoolean("privateLanguageInitialized", false)
        if (initialized) return
        val choice = LocaleMatcher.privateMigrationChoice(initialized, prefs.contains(KEY), fallback)
        val edit = prefs.edit().putBoolean("privateLanguageInitialized", true)
        if (choice != null) {
            edit.putString(KEY, JSONObject().put("languageOverride", choice).toString())
        }
        edit.apply()
    }

    /** Resolve against today's ordered system preferences while the WebView is absent. */
    fun locale(context: Context): String = LocaleMatcher.resolve(NativeLanguage.deviceLanguages(context), NativeLanguage.override(context))

    fun formattingLocale(context: Context): Locale {
        val value = saved(context).optString("formattingLocaleOverride")
        return if (value.isNotEmpty() && value != "null") Locale.forLanguageTag(value)
            else Locale.forLanguageTag(NativeLanguage.deviceLanguages(context).firstOrNull() ?: "en-US")
    }

    fun is24Hour(context: Context): Boolean {
        val value = saved(context)
        if (value.optBoolean("timeFormatChosen")) return value.optString("timeFormat") == "24h"
        // Match the web's Intl locale default, including a separate regional override.
        val pattern = DateFormat.getBestDateTimePattern(formattingLocale(context), "jm")
        return pattern.none { it == 'h' || it == 'K' }
    }

    /** Read bundled trusted catalogs; failure retains readable English keys and logs the packaging defect. */
    private fun catalog(context: Context, locale: String): JSONObject = synchronized(catalogs) {
        val identity = when (locale) {
            "en-CA" -> "en-US"
            "fr-CA" -> "fr-FR"
            else -> locale
        }
        catalogs.getOrPut(identity) {
            try {
                context.assets.open("localization/$identity.json").bufferedReader().use { JSONObject(it.readText()) }
            } catch (error: Exception) {
                Log.w("PersistLocale", "Bundled language catalog could not be read: $identity", error)
                JSONObject()
            }
        }
    }

    /** Substitute parameters once, leaving medicine names, numbers and units unchanged. */
    fun text(context: Context, key: String, parameters: Map<String, Any> = emptyMap()): String {
        val template = catalog(context, locale(context)).optString(key, catalog(context, "en-US").optString(key, key))
        return placeholder.replace(template) { match -> parameters[match.groupValues[1]]?.toString() ?: match.value }
    }

    /** Bind only app-owned labels so language changes preserve confirmation and custom-input state. */
    fun bind(view: TextView, key: String, parameters: Map<String, Any> = emptyMap()): TextView {
        bindings[view] = key to parameters
        view.text = text(view.context, key, parameters)
        return view
    }

    /** Render only the server-designated marker; the underlying body remains literal user content. */
    fun body(context: Context, spec: AlarmSpec): String {
        if (spec.bodyTemplate != "escalated") return spec.body
        return if (spec.baseBody.isEmpty()) {
            text(context, "Escalated")
        } else {
            text(context, "{{body}} (escalated)", mapOf("body" to spec.baseBody))
        }
    }

    fun bindBody(view: TextView, spec: AlarmSpec): TextView {
        bodyBindings[view] = spec
        view.text = body(view.context, spec)
        return view
    }

    fun refresh(root: View) {
        if (root is TextView) {
            bindings[root]?.let { (key, parameters) -> root.text = text(root.context, key, parameters) }
            bodyBindings[root]?.let { root.text = body(root.context, it) }
        }
        if (root is ViewGroup) {
            for (index in 0 until root.childCount) refresh(root.getChildAt(index))
        }
    }
}
