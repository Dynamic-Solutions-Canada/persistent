package ca.persistent.app.alarm

import org.junit.Assert.assertEquals
import org.junit.Test

/** Exercises the alarm sound and surface decision without audio hardware or a device. */
class AlarmSoundGateTest {
    private val now = 10_000_000L
    private val oneMinuteAgo = now - 60_000L

    private fun decide(last: SoundStamp?, alarm: Boolean, silent: Boolean = false, deferred: Boolean = false) =
        AlarmSoundGate.decide(last, now, alarm, silent, deferred)

    /** The reported bug: a one-minute escalation was debounced by its own first fire. */
    @Test fun escalationShortlyAfterTheNagSoundsAndPresentsTheSurface() {
        val decision = decide(SoundStamp(oneMinuteAgo, alarm = false), alarm = true)
        assertEquals(SoundDecision(sound = true, presentSurface = true), decision)
    }

    @Test fun duplicateAlarmPushDoesNotRingAgainButKeepsTheSurfaceUp() {
        val decision = decide(SoundStamp(oneMinuteAgo, alarm = true), alarm = true)
        assertEquals(SoundDecision(sound = false, presentSurface = true), decision)
    }

    @Test fun duplicateNagStaysQuiet() {
        val decision = decide(SoundStamp(oneMinuteAgo, alarm = false), alarm = false)
        assertEquals(SoundDecision(sound = false, presentSurface = false), decision)
    }

    @Test fun silentReassertNeitherSoundsNorRaisesTheSurface() {
        val decision = decide(SoundStamp(oneMinuteAgo, alarm = false), alarm = true, silent = true)
        assertEquals(SoundDecision(sound = false, presentSurface = false), decision)
    }

    @Test fun alarmDeferredDuringACallWaitsForTheCallToEnd() {
        val decision = decide(null, alarm = true, deferred = true)
        assertEquals(SoundDecision(sound = false, presentSurface = false), decision)
    }

    @Test fun repeatAfterTheWindowSoundsNormally() {
        val longAgo = now - AlarmSoundGate.DEBOUNCE_MS
        assertEquals(SoundDecision(sound = true, presentSurface = true), decide(SoundStamp(longAgo, alarm = true), alarm = true))
        assertEquals(SoundDecision(sound = true, presentSurface = false), decide(SoundStamp(longAgo, alarm = false), alarm = false))
    }

    /** A stamp written by the previous version (a bare timestamp) must not block an escalation. */
    @Test fun legacyTimestampBeforeAnEscalationStillRings() {
        val decision = decide(SoundStamp.legacy(oneMinuteAgo), alarm = true)
        assertEquals(SoundDecision(sound = true, presentSurface = true), decision)
    }
}
