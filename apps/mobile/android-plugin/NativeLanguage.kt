package ca.persistent.app.alarm

import android.app.LocaleManager
import android.content.Context
import android.os.Build
import android.os.LocaleList
import org.json.JSONObject

/** Android 13's OS picker and the in-app picker share one authoritative language preference. */
internal object NativeLanguage {
    /** Device formatting follows system locales, independently of the app's wording override. */
    fun deviceLanguages(context: Context): List<String> {
        val locales = if (Build.VERSION.SDK_INT >= 33) {
            context.getSystemService(LocaleManager::class.java).systemLocales
        } else {
            context.resources.configuration.locales
        }
        return (0 until locales.size()).map { locales[it].toLanguageTag() }
    }

    /** The OS choice supersedes the private mirror, including clearing it back to Match device. */
    fun override(context: Context): String? {
        if (Build.VERSION.SDK_INT < 33) return LocaleMatcher.applicationOverride(false, emptyList(), NativeText.storedOverride(context))
        val locales = context.getSystemService(LocaleManager::class.java).applicationLocales
        return LocaleMatcher.applicationOverride(true, (0 until locales.size()).map { locales[it].toLanguageTag() }, NativeText.storedOverride(context))
    }

    /** Migrate a pre-existing in-app choice once; never restore it over a later OS reset. */
    fun initialize(context: Context, fallback: String?) {
        if (Build.VERSION.SDK_INT < 33) {
            NativeText.initializePrivateLanguage(context, fallback)
            return
        }
        val prefs = context.getSharedPreferences("persistent_locale", Context.MODE_PRIVATE)
        if (prefs.getBoolean("systemLanguageInitialized", false)) return
        val manager = context.getSystemService(LocaleManager::class.java)
        val locales = manager.applicationLocales
        val prior = LocaleMatcher.migrationChoice((0 until locales.size()).map { locales[it].toLanguageTag() }, NativeText.storedOverride(context), fallback)
        if (prior != null) {
            manager.applicationLocales = LocaleList.forLanguageTags(prior)
        }
        prefs.edit().putBoolean("systemLanguageInitialized", true).apply()
    }

    /** Only an explicit in-app choice writes the OS setting; background reads never overwrite it. */
    fun apply(context: Context, choice: String?) {
        if (Build.VERSION.SDK_INT < 33) return
        val manager = context.getSystemService(LocaleManager::class.java)
        val languages = if (choice == null) LocaleList.getEmptyLocaleList() else LocaleList.forLanguageTags(choice)
        context.getSharedPreferences("persistent_locale", Context.MODE_PRIVATE)
            .edit().putBoolean("systemLanguageInitialized", true).apply()
        if (manager.applicationLocales != languages) manager.applicationLocales = languages
    }

    /** Additive display-only bridge snapshot, with no credentials, reminders or account settings. */
    fun snapshot(context: Context): JSONObject = JSONObject()
        .put("version", 1)
        .put("languageOverride", override(context) ?: JSONObject.NULL)
        .put("deviceLanguages", org.json.JSONArray(deviceLanguages(context)))
}
