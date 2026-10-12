package ca.persistent.app.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Protect capture acceptance at fractional viewport and system-bar boundaries without cloud jobs. */
class LabCaptureGeometryTest {
    @Test fun usesFractionalViewportInsteadOfRoundedInnerWidth() {
        val scale = LabCaptureGeometry.conversionScale(1080.0, 412.19049072265625, 1.0, 0.0, 0.0)
        assertEquals(1080.0 / 412.19049072265625, scale, 0.000000001)
        assertFalse(scale == 1080.0 / 412.0)
    }

    @Test fun rejectsZoomOffsetAndInvalidDimensions() {
        val cases = listOf(
            doubleArrayOf(0.0, 412.0, 1.0, 0.0, 0.0),
            doubleArrayOf(1080.0, Double.NaN, 1.0, 0.0, 0.0),
            doubleArrayOf(1080.0, 412.0, 1.5, 0.0, 0.0),
            doubleArrayOf(1080.0, 412.0, 1.0, 1.0, 0.0),
            doubleArrayOf(1080.0, 412.0, 1.0, 0.0, 1.0)
        )
        for (values in cases) {
            try {
                LabCaptureGeometry.conversionScale(values[0], values[1], values[2], values[3], values[4])
                throw AssertionError("Invalid viewport accepted")
            } catch (_: IllegalArgumentException) { }
        }
    }

    @Test fun doesNotAllowEvenFractionalSystemBarOverlap() {
        assertTrue(LabCaptureGeometry.clearsVerticalBars(63.0, 2337.0, 63.0, 2337.0))
        assertFalse(LabCaptureGeometry.clearsVerticalBars(62.99, 100.0, 63.0, 2337.0))
        assertFalse(LabCaptureGeometry.clearsVerticalBars(100.0, 2337.01, 63.0, 2337.0))
    }

    @Test fun rejectsEmptyOrUnorderedControlBounds() {
        for ((top, bottom) in listOf(0.0 to 0.0, 100.0 to 50.0, Double.NaN to 100.0)) {
            try {
                LabCaptureGeometry.clearsVerticalBars(top, bottom, 63.0, 2337.0)
                throw AssertionError("Invalid bounds accepted")
            } catch (_: IllegalArgumentException) { }
        }
    }
}
