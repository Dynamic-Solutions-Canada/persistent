package ca.persistent.app.alarm

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Run on Android's ICU-backed regex engine, which rejects braces that desktop Java accepts. */
class NativeTextTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun resumeLanguageSnapshotInitializesNativeText() {
        assertEquals(1, NativeLanguage.snapshot(context).getInt("version"))
    }

    @Test fun placeholdersPreserveMissingParametersAndLiteralReplacementText() {
        val literal = "Medicine $5 \\ dose {{name}} \uD83D\uDC8A"
        assertEquals(
            "__native_test__ $literal / $literal / {{missing}} / {name} / {{bad-name}}",
            NativeText.text(
                context,
                "__native_test__ {{name}} / {{ name }} / {{missing}} / {name} / {{bad-name}}",
                mapOf("name" to literal)
            )
        )
    }

    @Test fun reminderBodiesRemainLiteralUnlessServerDesignatesTemplate() {
        val literal = "Medicine {{body}} $5 \\ \uD83D\uDC8A"
        val spec = AlarmSpec("test", 0, "title", literal, 0, false, false, "")
        assertEquals(literal, NativeText.body(context, spec))
        val escalated = NativeText.body(context, spec.copy(bodyTemplate = "escalated", baseBody = literal))
        assertTrue(escalated.contains(literal))
        assertEquals(
            NativeText.text(context, "{{body}} (escalated)", mapOf("body" to literal)),
            escalated
        )
    }
}
