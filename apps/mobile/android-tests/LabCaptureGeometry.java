package ca.persistent.app.capture;

/** Pure coordinate checks shared by isolated instrumentation and local JVM tests, never the app APK. */
public final class LabCaptureGeometry {
    private LabCaptureGeometry() { }

    /** Convert using fractional viewport width, refusing zoomed/offset or invalid capture geometry. */
    public static double conversionScale(double webWidth, double visualWidth, double zoom, double offsetLeft, double offsetTop) {
        requireFinite(webWidth, visualWidth, zoom, offsetLeft, offsetTop);
        if (webWidth <= 0 || visualWidth <= 0) throw new IllegalArgumentException("Invalid viewport dimensions.");
        if (Math.abs(zoom - 1.0) >= 0.000001 || Math.abs(offsetLeft) >= 0.000001 || Math.abs(offsetTop) >= 0.000001) {
            throw new IllegalArgumentException("Zoomed or offset capture geometry is unsupported.");
        }
        return webWidth / visualWidth;
    }

    /** Require complete, ordered control bounds inside the actual status/navigation safe interval. */
    public static boolean clearsVerticalBars(double top, double bottom, double safeTop, double safeBottom) {
        requireFinite(top, bottom, safeTop, safeBottom);
        if (top >= bottom || safeTop > safeBottom) throw new IllegalArgumentException("Invalid control bounds.");
        return top >= safeTop && bottom <= safeBottom;
    }

    /** Reject invalid measurements rather than allowing NaN comparisons to silently pass. */
    private static void requireFinite(double... values) {
        for (double value : values) {
            if (!Double.isFinite(value)) throw new IllegalArgumentException("Nonfinite capture geometry.");
        }
    }
}
