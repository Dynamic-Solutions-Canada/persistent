package ca.persistent.app.capture;

import android.app.Activity;
import android.app.Instrumentation;
import android.graphics.Rect;
import android.view.WindowInsets;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;

/** Observe actual native shade/alarm controls without borrowing the underlying WebView's evidence. */
final class LabNativeSurfaceReadiness {
    /** Require the selected shade reminder and its expanded native actions, preserving every obligation. */
    static JSONObject measureShade(Instrumentation instrumentation, UiDevice device) throws Exception {
        requireActivePackage(instrumentation, "com.android.systemui");
        JSONObject data = new JSONObject().put("surface", "shade").put("webClearanceClaim", false);
        JSONArray controls = new JSONArray();
        for (String text : new String[]{"Water the plants", "Done", "Snooze"}) {
            UiObject2 node = device.findObject(By.pkg("com.android.systemui").textContains(text));
            if (node == null) throw new IllegalStateException("Required native shade control missing.");
            controls.put(bounds(text, node.getVisibleBounds()));
        }
        return data.put("nativeControls", controls);
    }

    /** Verify the real monitored AlarmActivity, its own insets and native title/action bounds. */
    static JSONObject measureAlarm(Instrumentation instrumentation, UiDevice device, Activity activity, String title) throws Exception {
        requireActivePackage(instrumentation, "ca.persistent.app");
        if (activity == null || !"ca.persistent.app.alarm.AlarmActivity".equals(activity.getClass().getName())) {
            throw new IllegalStateException("Actual native AlarmActivity was not observed.");
        }
        AtomicReference<JSONObject> measured = new AtomicReference<>();
        AtomicReference<Exception> failure = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> {
            try {
                android.view.View decor = activity.getWindow().getDecorView();
                if (activity.isFinishing() || !decor.hasWindowFocus()) throw new IllegalStateException("Native alarm does not own the visible window.");
                WindowInsets insets = decor.getRootWindowInsets();
                if (insets == null) throw new IllegalStateException("Native alarm insets unavailable.");
                int[] origin = new int[2];
                decor.getLocationOnScreen(origin);
                measured.set(new JSONObject()
                    .put("surface", "alarm").put("webClearanceClaim", false)
                    .put("activity", activity.getClass().getName())
                    .put("windowTop", origin[1]).put("windowBottom", origin[1] + decor.getHeight())
                    .put("statusInsetTop", insets.getInsets(WindowInsets.Type.statusBars()).top)
                    .put("navigationInsetBottom", insets.getInsets(WindowInsets.Type.navigationBars()).bottom));
            } catch (Exception error) {
                failure.set(error);
            }
        });
        if (failure.get() != null) throw failure.get();
        JSONObject result = measured.get();
        double safeTop = result.getDouble("windowTop") + result.getDouble("statusInsetTop");
        double safeBottom = result.getDouble("windowBottom") - result.getDouble("navigationInsetBottom");
        JSONArray controls = new JSONArray();
        UiObject2 titleNode = device.findObject(By.pkg("ca.persistent.app").clazz("android.widget.TextView").text(title));
        if (titleNode == null) throw new IllegalStateException("Native alarm title missing.");
        controls.put(guardedBounds("title", titleNode.getVisibleBounds(), safeTop, safeBottom));
        for (String label : new String[]{"Done", "Snooze", "De-escalate"}) {
            UiObject2 node = device.findObject(By.pkg("ca.persistent.app").clazz("android.widget.TextView").clickable(true).textContains(label));
            if (node == null) throw new IllegalStateException("Native alarm action missing.");
            controls.put(guardedBounds(label, node.getVisibleBounds(), safeTop, safeBottom));
        }
        return result.put("nativeControls", controls).put("nativeControlsClearOfSystemBar", true);
    }

    /** A package check prevents stale controls from another activity or the covered WebView being accepted. */
    private static void requireActivePackage(Instrumentation instrumentation, String required) {
        AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
        if (root == null) throw new IllegalStateException("Native active window missing.");
        boolean matches = required.contentEquals(root.getPackageName() == null ? "" : root.getPackageName());
        root.recycle();
        if (!matches) throw new IllegalStateException("Required native surface is not active.");
    }

    /** Check physical native coordinates directly, avoiding CSS conversion on native scenes. */
    private static JSONObject guardedBounds(String role, Rect rect, double safeTop, double safeBottom) throws Exception {
        if (!LabCaptureGeometry.clearsVerticalBars(rect.top, rect.bottom, safeTop, safeBottom)) {
            throw new IllegalStateException("Native alarm control overlaps system bar.");
        }
        return bounds(role, rect);
    }

    /** Export control roles and original physical bounds only, never account or arbitrary reminder content. */
    private static JSONObject bounds(String role, Rect rect) throws Exception {
        if (rect.width() <= 0 || rect.height() <= 0) throw new IllegalStateException("Native control has empty visible bounds.");
        return new JSONObject().put("role", role).put("left", rect.left).put("top", rect.top)
            .put("right", rect.right).put("bottom", rect.bottom);
    }
}
