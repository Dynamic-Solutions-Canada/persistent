package ca.persistent.app.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PushBodyRangeTest {
    @Test fun serverRangesRoundTripLongLiteralContentInUtf16() {
        for (literal in listOf("a".repeat(2800), "药".repeat(1000), "💊".repeat(750),
            "💊 {{body}} (escalated)（已升级提醒） 10 units <b>literal</b>")) {
            assertEquals(literal, PushBodyRange.extract("${literal}（已升级提醒）", "0:${literal.length}"))
            // Future templates may put application wording before the user body.
            assertEquals(literal, PushBodyRange.extract("💊: $literal (escalated)", "4:${literal.length}"))
        }
        assertEquals("", PushBodyRange.extract("Escalated", "0:0"))
    }

    @Test fun legacyAndMalformedRangesKeepDisplayVerbatim() {
        for (range in listOf(null, "", "-1:1", "1:-1", "1:99", "999999999999:1", "0:1:2", " 0:1")) {
            assertNull(PushBodyRange.extract("💊 medicine", range))
        }
        assertNull(PushBodyRange.extract("💊 medicine", "0:1"))
        assertNull(PushBodyRange.extract("💊 medicine", "1:1"))
        assertEquals("💊", PushBodyRange.extract("💊 medicine", "0:2"))
    }
}
