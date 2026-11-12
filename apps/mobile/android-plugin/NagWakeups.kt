package ca.persistent.app.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock

/**
 * Wakes the device for a nag's next follow-up, through AlarmManager.
 *
 * Follow-ups used to be Handler timers inside [AlarmService]. Those count uptime,
 * which stops while the phone deep-sleeps, so a nag due with the screen off waited
 * for whatever happened to wake the phone next (see docs/alarm-architecture.md). An
 * alarm wakes the device on time and also survives the app process being killed:
 * the wake-up reaches [AlarmReceiver] and then [AlarmService], which rebuilds the
 * occurrence from [AlarmStore] if it has to.
 *
 * One wake-up per occurrence: the PendingIntent is keyed by the occurrence (its
 * data URI), so scheduling again replaces the previous one and cancel removes it.
 * In deep idle, follow-ups are spaced at least 90 seconds apart across all
 * reminders ([NagIdleSpacing]) so they never spend the allowance a reminder's first
 * fire needs; that delays a follow-up but never loses it.
 */
object NagWakeups {
    const val ACTION_NAG = "ca.persistent.app.ALARM_NAG"
    const val EXTRA_GENERATION = "generation"
    private const val PREFS = "persistent_nag_wakeups"
    private const val KEY_LAST_IDLE_TRIGGER = "last_idle_trigger"

    /** Wake the device after [delayMs] to deliver the follow-up for [occurrenceId]. */
    fun schedule(context: Context, occurrenceId: String, generation: Long, delayMs: Long) {
        val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val triggerAt = spacedTrigger(context, delayMs)
        val pending = pendingIntent(context, occurrenceId, generation, PendingIntent.FLAG_UPDATE_CURRENT)
            ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
            // Without the exact-alarm grant, a best-effort wake-up still beats none.
            manager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pending)
        } else {
            manager.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pending)
        }
    }

    /**
     * The trigger time for a follow-up due in [delayMs], spaced out while the device is
     * in deep idle so follow-ups can't spend the allowance first fires need
     * ([NagIdleSpacing]). Remembers the last idle trigger across processes.
     */
    private fun spacedTrigger(context: Context, delayMs: Long): Long {
        val now = SystemClock.elapsedRealtime()
        val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val idle = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && power.isDeviceIdleMode
        if (!idle) return now + delayMs

        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val triggerAt = NagIdleSpacing.trigger(now, delayMs, idle = true, lastIdleTrigger = prefs.getLong(KEY_LAST_IDLE_TRIGGER, 0))
        prefs.edit().putLong(KEY_LAST_IDLE_TRIGGER, triggerAt).apply()
        return triggerAt
    }

    /** Drop the pending follow-up for [occurrenceId], if there is one. */
    fun cancel(context: Context, occurrenceId: String) {
        val pending = pendingIntent(context, occurrenceId, 0, PendingIntent.FLAG_NO_CREATE) ?: return
        val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        manager.cancel(pending)
        pending.cancel()
    }

    /**
     * The broadcast for one occurrence's follow-up. Extras don't take part in
     * PendingIntent identity, so the occurrence goes in the data URI; the generation
     * rides in an extra that FLAG_UPDATE_CURRENT refreshes. Returns null only for
     * FLAG_NO_CREATE when nothing is pending.
     */
    private fun pendingIntent(context: Context, occurrenceId: String, generation: Long, flag: Int): PendingIntent? {
        val intent = Intent(context, AlarmReceiver::class.java)
            .setAction(ACTION_NAG)
            .setData(Uri.fromParts("persistent-nag", occurrenceId, null))
            .putExtra(AlarmReceiver.EXTRA_OCCURRENCE_ID, occurrenceId)
            .putExtra(EXTRA_GENERATION, generation)
        return PendingIntent.getBroadcast(context, 0, intent, flag or PendingIntent.FLAG_IMMUTABLE)
    }
}
