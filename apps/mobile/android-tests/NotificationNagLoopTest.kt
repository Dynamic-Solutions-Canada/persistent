package ca.persistent.app.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Exercises edited nag deadlines without waiting for real time or using Android hardware. */
class NotificationNagLoopTest {
    /** A fake AlarmManager: one pending wake-up per occurrence, replaced on reschedule. */
    private class Clock {
        var now = 0L
        var generations = 0L
        val pending = LinkedHashMap<String, Pair<Long, Long>>() // occurrence -> (deadline, generation)
        val cancelled = mutableListOf<String>()
        val alerts = mutableListOf<String>()
        val loops = NotificationNagLoop(
            schedule = { id, generation, delay -> pending[id] = Pair(now + delay, generation) },
            cancel = { id -> pending.remove(id); cancelled.add(id) },
            notify = { id -> alerts.add(id) },
            newGeneration = { ++generations }
        )

        fun advance(seconds: Int) {
            val target = now + seconds * 1000L
            while (true) {
                val next = pending.minByOrNull { it.value.first } ?: break
                if (next.value.first > target) break
                now = next.value.first
                pending.remove(next.key)
                loops.fire(next.key, next.value.second)
            }
            now = target
        }
    }

    @Test fun editingFifteenMinutesToOneHourCancelsOldDeadlineWithoutAlerting() {
        val clock = Clock()
        clock.loops.update("live", 900)
        clock.advance(300)
        val staleGeneration = clock.pending.getValue("live").second
        clock.loops.update("live", 3600)
        // The old wake-up was already on its way when the interval changed.
        assertFalse(clock.loops.fire("live", staleGeneration))
        clock.advance(3599)
        assertTrue(clock.alerts.isEmpty())
        assertEquals(1, clock.pending.size)
        clock.advance(1)
        assertEquals(listOf("live"), clock.alerts)
        clock.advance(3600)
        assertEquals(listOf("live", "live"), clock.alerts)
    }

    @Test fun routineSyncDoesNotPostponeNagAndShorterIntervalTakesEffect() {
        val clock = Clock()
        clock.loops.update("live", 3600)
        clock.advance(600)
        clock.loops.update("live", 3600)
        clock.advance(3000)
        assertEquals(listOf("live"), clock.alerts)
        clock.loops.update("live", 900)
        clock.advance(900)
        assertEquals(listOf("live", "live"), clock.alerts)
    }

    @Test fun disablingNagsAndClearingCancelTimersIndependently() {
        val clock = Clock()
        clock.loops.update("first", 900)
        clock.loops.update("second", 900)
        clock.loops.update("first", 0)
        clock.advance(900)
        assertEquals(listOf("second"), clock.alerts)
        clock.loops.clear()
        clock.advance(3600)
        assertTrue(clock.pending.isEmpty())
        assertEquals(listOf("second"), clock.alerts)
    }

    @Test fun wakeUpAfterRemovalDoesNotNag() {
        val clock = Clock()
        clock.loops.update("live", 900)
        val generation = clock.pending.getValue("live").second
        clock.loops.remove("live")
        assertFalse(clock.loops.fire("live", generation))
        assertTrue(clock.alerts.isEmpty())
    }

    @Test fun removalCancelsAWakeUpThisProcessNeverTracked() {
        // A wake-up armed by an earlier process must not outlive its notification.
        val clock = Clock()
        assertFalse(clock.loops.isTracking("from-earlier-process"))
        clock.loops.remove("from-earlier-process")
        assertEquals(listOf("from-earlier-process"), clock.cancelled)
    }

    @Test fun unknownWakeUpIsLeftToTheCallerToRestore() {
        val clock = Clock()
        assertFalse(clock.loops.fire("fresh-process", 42))
        assertTrue(clock.alerts.isEmpty())
        assertTrue(clock.pending.isEmpty())
    }

    private fun spec() = AlarmSpec(
        occurrenceId = "live", fireAtMs = 0, title = "Reminder", body = "",
        soundIntervalSeconds = 900, alarm = false, ongoing = true, soundUri = "old"
    )

    @Test fun intervalOnlyEditAndToneEditReachActiveNotification() {
        val current = spec()
        val stored = current.copy(soundIntervalSeconds = 3600, soundUri = "new", nagSoundUri = "nag")
        val updated = current.refreshNotificationFrom(stored)
        assertEquals(3600, updated.soundIntervalSeconds)
        assertEquals("new", updated.soundUri)
        assertEquals("nag", updated.nagSoundUri)
    }

    @Test fun refreshPreservesLocalEscalationAndSilenceState() {
        val stored = spec().copy(soundIntervalSeconds = 3600)
        val escalated = spec().copy(alarm = true, canSilence = true, soundUri = "alarm")
        val refreshed = escalated.refreshNotificationFrom(stored)
        assertTrue(refreshed.alarm)
        assertTrue(refreshed.canSilence)
        assertEquals("alarm", refreshed.soundUri)
        val silenced = spec().refreshNotificationFrom(stored.copy(alarm = true, canSilence = true))
        assertFalse(silenced.alarm)
        assertFalse(silenced.canSilence)
    }

    @Test fun deepIdleSpacesFollowUpsSoFirstFiresKeepTheirAllowance() {
        // Outside idle, a follow-up keeps its own interval.
        assertEquals(65_000L, NagIdleSpacing.trigger(now = 5_000, delayMs = 60_000, idle = false, lastIdleTrigger = 10_000))
        // In idle, the first one has nothing to space against.
        assertEquals(65_000L, NagIdleSpacing.trigger(now = 5_000, delayMs = 60_000, idle = true, lastIdleTrigger = 0))
        // A 5-second nag right after another idle follow-up waits the full spacing.
        assertEquals(155_000L, NagIdleSpacing.trigger(now = 60_000, delayMs = 5_000, idle = true, lastIdleTrigger = 65_000))
        // A remembered trigger from before a reboot is ignored.
        assertEquals(65_000L, NagIdleSpacing.trigger(now = 5_000, delayMs = 60_000, idle = true, lastIdleTrigger = 900_000_000_000))
    }
}
