package ca.persistent.app.alarm

/**
 * What the service last sounded for one occurrence: when, and whether it was the ringing
 * alarm rather than a nag. Stored by [AlarmStore] under `sounded_at`.
 */
data class SoundStamp(val atMs: Long, val alarm: Boolean) {
    companion object {
        /**
         * A stamp written before the kind was recorded (a bare timestamp). It is read as a nag,
         * so an escalation that arrives while an update is installing still rings.
         */
        fun legacy(atMs: Long) = SoundStamp(atMs, alarm = false)
    }
}

/** What one start of an occurrence should do: play its sound, and put the alarm surface up. */
data class SoundDecision(val sound: Boolean, val presentSurface: Boolean)

/**
 * Decides whether a start of an occurrence sounds and whether it raises the alarm surface.
 *
 * The same occurrence can be started twice within a minute or two: the on-device alarm and a
 * server push that duplicates it. The second start must not ring again, so a sound within
 * [DEBOUNCE_MS] of the last one is skipped. An escalation is not a duplicate, though: it
 * upgrades that occurrence from a nag to the ringing alarm in place, under the same id. So an
 * alarm start after a nag always sounds, however soon it follows. Before this distinction, an
 * escalation within four minutes of the first fire neither rang nor showed the alarm screen.
 *
 * A nag start after the alarm (as after De-escalate) stays debounced, as before.
 *
 * Any audible alarm start presents the surface, debounced or not. Presenting it again is
 * harmless, and the alarm must never ring, or be meant to ring, with nothing on screen to
 * stop it. Whether the tone actually played plays no part: a failed or muted tone still
 * leaves the surface up.
 */
object AlarmSoundGate {
    /** How long after a sound a duplicate start of the same kind stays quiet. */
    const val DEBOUNCE_MS = 4 * 60_000L

    /**
     * @param last What this occurrence last sounded, or null when it has not sounded.
     * @param nowMs The current time, in milliseconds since the epoch.
     * @param alarm Whether this start is the ringing alarm (a fire or an escalation).
     * @param silent A keep-alive re-assert of a notification that is already showing; it
     *   never sounds and never raises the surface.
     * @param deferred The alarm is held during a call; the call-end resume starts it again.
     */
    fun decide(
        last: SoundStamp?,
        nowMs: Long,
        alarm: Boolean,
        silent: Boolean,
        deferred: Boolean,
    ): SoundDecision {
        if (silent || deferred) return SoundDecision(sound = false, presentSurface = false)

        val withinWindow = last != null && nowMs - last.atMs < DEBOUNCE_MS
        // An escalation (alarm after a nag) is the one start inside the window that still sounds.
        val escalation = alarm && last != null && !last.alarm
        val duplicate = withinWindow && !escalation

        return SoundDecision(sound = !duplicate, presentSurface = alarm)
    }
}
