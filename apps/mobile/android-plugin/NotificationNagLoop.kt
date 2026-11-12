package ca.persistent.app.alarm

/**
 * Owns the follow-up nag schedule for live notifications, preserving each deadline
 * until its interval actually changes.
 *
 * Deliberately free of Android types: the caller supplies the wake-up mechanism.
 * In the app that is [NagWakeups], an AlarmManager alarm per occurrence, because an
 * in-process timer (Handler) counts uptime, which stops while the phone deep-sleeps,
 * so a nag due during sleep would wait for some unrelated wake-up.
 *
 * Every scheduled wake-up carries a generation number. A wake-up whose generation
 * is no longer current (the interval was edited, or the nag cleared, after it was
 * already on its way) is ignored rather than nagging early.
 */
class NotificationNagLoop(
    /** Arrange for [fire] to be called with this generation after `delayMs`, replacing any earlier wake-up for the occurrence. */
    private val schedule: (occurrenceId: String, generation: Long, delayMs: Long) -> Unit,
    /** Drop any pending wake-up for the occurrence. Safe to call when none exists. */
    private val cancel: (occurrenceId: String) -> Unit,
    /** Re-alert the occurrence's notification: the nag itself. */
    private val notify: (occurrenceId: String) -> Unit,
    /** A generation never handed out before, including by an earlier process. */
    private val newGeneration: () -> Long
) {
    private data class Loop(val seconds: Int, val generation: Long)
    private val active = HashMap<String, Loop>()

    /** A changed interval starts a full new wait; zero disables nags without clearing the notification. */
    fun update(occurrenceId: String, seconds: Int) {
        if (active[occurrenceId]?.seconds == seconds) return
        remove(occurrenceId)
        if (seconds <= 0) return
        arm(occurrenceId, seconds)
    }

    /** Whether this process is running a nag schedule for the occurrence. */
    fun isTracking(occurrenceId: String): Boolean = active.containsKey(occurrenceId)

    /**
     * A scheduled wake-up arrived. Nags and schedules the next one when the
     * generation is current; ignores a stale or unknown one. Returns whether it nagged.
     */
    fun fire(occurrenceId: String, generation: Long): Boolean {
        val loop = active[occurrenceId] ?: return false
        if (loop.generation != generation) return false

        notify(occurrenceId)
        // `notify` may have cleared or re-armed this occurrence; only continue the
        // schedule that just fired.
        if (active[occurrenceId] === loop) arm(occurrenceId, loop.seconds)
        return true
    }

    /**
     * Cancels a firing's pending follow-up. Always cancels the wake-up, even when
     * this process isn't tracking it, so one armed by an earlier process can't outlive
     * the notification it was for.
     */
    fun remove(occurrenceId: String) {
        active.remove(occurrenceId)
        cancel(occurrenceId)
    }

    /** Cancels all tracked follow-ups on service teardown or account reset. */
    fun clear() {
        active.keys.toList().forEach { remove(it) }
    }

    private fun arm(occurrenceId: String, seconds: Int) {
        val generation = newGeneration()
        active[occurrenceId] = Loop(seconds, generation)
        schedule(occurrenceId, generation, seconds * 1000L)
    }
}

/**
 * Spacing for follow-up wake-ups while the device is in deep idle (Doze).
 *
 * There Android allows each app 72 allow-while-idle alarms an hour, and a
 * reminder's *first* fire draws on the same allowance. Unthrottled follow-ups (as
 * often as every 5 seconds) could spend it and make a new reminder fire late, which
 * is worse than a late repeat. Spacing every follow-up wake-up at least
 * [IDLE_SPACING_MS] after the previous one caps them at 40 an hour, leaving the
 * rest for first fires and escalations. Outside deep idle there is no allowance to
 * protect, so follow-ups keep their own interval.
 */
object NagIdleSpacing {
    const val IDLE_SPACING_MS = 90_000L

    /**
     * When a follow-up scheduled at [now] (elapsed-realtime ms) for [delayMs] should
     * trigger, given the trigger of the last follow-up scheduled in deep idle
     * ([lastIdleTrigger], 0 when none). A remembered trigger from before a reboot
     * (far in the future of the new boot clock) is ignored.
     */
    fun trigger(now: Long, delayMs: Long, idle: Boolean, lastIdleTrigger: Long): Long {
        val wanted = now + delayMs
        if (!idle) return wanted
        val plausible = lastIdleTrigger in 1..(now + 24 * 60 * 60 * 1000L)
        return if (plausible) maxOf(wanted, lastIdleTrigger + IDLE_SPACING_MS) else wanted
    }
}
