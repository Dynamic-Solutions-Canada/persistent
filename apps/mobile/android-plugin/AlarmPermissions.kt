package ca.persistent.app.alarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat

/**
 * The Android grants that decide whether a fired alarm reaches the user, and the
 * system screens that change them.
 *
 * Owns two things the plugin exposes to the WebView: whether each grant is held
 * ([readiness]) and opening the one screen that changes it ([openSettings]). Every
 * check reports `true` on Android versions where the grant does not exist or does
 * not matter, so the app never asks for something that would change nothing.
 *
 * Opening a screen never waits for the user. It reports only whether a screen was
 * actually started; the WebView re-reads [readiness] when the app resumes, which is
 * the only reliable signal that the user came back. Some OEM builds omit a screen,
 * and that is reported as `false` instead of being swallowed, so the app can tell
 * the user where to look themselves.
 */
object AlarmPermissions {
    /** A grant the app explains and can send the user to change. */
    enum class Grant(val key: String) {
        NOTIFICATIONS("notifications"),
        EXACT_ALARMS("exactAlarms"),
        FULL_SCREEN("fullScreen"),
        OVERLAY("overlay"),
        BATTERY("battery");

        companion object {
            fun fromKey(key: String?): Grant? = entries.firstOrNull { it.key == key }
        }
    }

    /** Whether [grant] is held, or is irrelevant on this Android version. */
    fun isSatisfied(context: Context, grant: Grant): Boolean = when (grant) {
        Grant.NOTIFICATIONS -> NotificationManagerCompat.from(context).areNotificationsEnabled()
        Grant.EXACT_ALARMS -> canScheduleExactAlarms(context)
        Grant.FULL_SCREEN -> canUseFullScreenIntent(context)
        Grant.OVERLAY -> canShowAlarmSurfaceWhileUnlocked(context)
        Grant.BATTERY -> isExemptFromBatteryOptimization(context)
    }

    /** Every grant, keyed as the WebView reads it. */
    fun readiness(context: Context): Map<String, Boolean> =
        Grant.entries.associate { it.key to isSatisfied(context, it) }

    /**
     * Open the system screen that changes [grant] for this app.
     *
     * Returns false when nothing was opened: the grant is already held (or doesn't
     * apply here), or this device has no such screen. Notifications open the app's
     * notification settings, which is the only route left once Android has stopped
     * showing the runtime prompt after repeated denials.
     */
    fun openSettings(context: Context, grant: Grant): Boolean {
        if (isSatisfied(context, grant)) return false
        val intent = settingsIntent(context, grant) ?: return false
        return try {
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (_: Exception) {
            // The OEM removed or renamed this screen; the caller explains the manual route.
            false
        }
    }

    fun canScheduleExactAlarms(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return manager.canScheduleExactAlarms()
    }

    /** Android 14 made the full-screen alarm surface a user grant, off by default for most apps. */
    private fun canUseFullScreenIntent(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return manager.canUseFullScreenIntent()
    }

    /**
     * Whether a ringing alarm can take over the screen while the device is *unlocked*.
     *
     * Android 15 refuses the activity launch from our foreground service unless the
     * app is exempt from the background-activity-launch rules, and "display over
     * other apps" is the exemption we hold (see AlarmService.presentAlarmSurface).
     * Below Android 15 the launch is allowed regardless, so report true there rather
     * than nagging for a permission that would change nothing.
     */
    fun canShowAlarmSurfaceWhileUnlocked(context: Context): Boolean =
        Build.VERSION.SDK_INT < 35 || Settings.canDrawOverlays(context)

    /**
     * Whether Doze and app standby leave this app alone. Exact allow-while-idle
     * alarms fire without it; it protects background re-sync and resists OEM
     * battery managers that otherwise kill the app.
     */
    private fun isExemptFromBatteryOptimization(context: Context): Boolean {
        val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return power.isIgnoringBatteryOptimizations(context.packageName)
    }

    /** The per-app system screen for [grant], or null where none exists on this version. */
    private fun settingsIntent(context: Context, grant: Grant): Intent? {
        val packageUri = Uri.parse("package:${context.packageName}")
        return when (grant) {
            Grant.NOTIFICATIONS ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                } else {
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(packageUri)
                }
            Grant.EXACT_ALARMS ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).setData(packageUri)
                } else {
                    null
                }
            Grant.FULL_SCREEN ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).setData(packageUri)
                } else {
                    null
                }
            Grant.OVERLAY -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).setData(packageUri)
            // The direct per-app dialog. Play permits it for apps whose core function is
            // exact user-set alarms (store/play-readiness.md, permissions table).
            Grant.BATTERY -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).setData(packageUri)
        }
    }
}
