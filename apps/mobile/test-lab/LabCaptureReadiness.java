package ca.persistent.app.capture;

import android.app.Instrumentation;
import android.content.pm.PackageInfo;
import android.graphics.Insets;
import android.view.WindowInsets;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;

/** Observe native overlays and measured inset clearance without altering notifications or layout. */
final class LabCaptureReadiness {
    private static final String[] OVERLAY_TEXT = {
        "Persistent", "Water the plants", "Feed the puppy", "Get out the door",
        "Take the bins out", "Take vitamin D", "Check the oven"
    };
    private static final long STABLE_CLEAR_MS = 2000;

    /** Require a continuously clear app window; a single quiet poll is insufficient for capture. */
    static void waitForStableApp(Instrumentation instrumentation, UiDevice device, long deadline) throws Exception {
        long clearSince = -1;
        while (android.os.SystemClock.elapsedRealtime() < deadline) {
            long now = android.os.SystemClock.elapsedRealtime();
            if (isAppClear(instrumentation, device)) {
                if (clearSince < 0) clearSince = now;
                if (now - clearSince >= STABLE_CLEAR_MS) return;
            } else {
                clearSince = -1;
            }
            Thread.sleep(200);
        }
        throw new IllegalStateException("Sustained clear native app window not established.");
    }

    /** Native app-name or synthetic content in SystemUI establishes a covering notification banner. */
    static boolean isAppClear(Instrumentation instrumentation, UiDevice device) {
        AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
        if (root == null) return false;
        boolean appVisible = "ca.persistent.app".contentEquals(root.getPackageName() == null ? "" : root.getPackageName());
        root.recycle();
        if (!appVisible) return false;
        // Generic heads_up resources remain on clear lab pixels. Check actual content instead.
        for (String text : OVERLAY_TEXT) {
            if (!device.findObjects(By.pkg("com.android.systemui").textContains(text)).isEmpty()) return false;
        }
        return true;
    }

    /** Measure the WebView's actual system insets and CSS viewport, retaining only layout metadata. */
    static JSONObject measure(Instrumentation instrumentation, WebView web) throws Exception {
        AtomicReference<JSONObject> nativeResult = new AtomicReference<>();
        AtomicReference<Exception> failure = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> {
            try {
                JSONObject data = new JSONObject();
                PackageInfo provider = WebView.getCurrentWebViewPackage();
                data.put("webViewPackage", provider == null ? JSONObject.NULL : provider.packageName);
                data.put("webViewVersion", provider == null ? JSONObject.NULL : provider.versionName);
                int[] webLocation = new int[2];
                int[] rootLocation = new int[2];
                web.getLocationOnScreen(webLocation);
                web.getRootView().getLocationOnScreen(rootLocation);
                data.put("webX", webLocation[0]);
                data.put("webY", webLocation[1]);
                data.put("webWidth", web.getWidth());
                data.put("webHeight", web.getHeight());
                data.put("webPaddingBottom", web.getPaddingBottom());
                data.put("webWindowFocused", web.hasWindowFocus());
                data.put("rootBottom", rootLocation[1] + web.getRootView().getHeight());
                data.put("rootTop", rootLocation[1]);
                data.put("rootHeight", web.getRootView().getHeight());
                int[] inWindow = new int[2];
                web.getLocationInWindow(inWindow);
                data.put("webWindowX", inWindow[0]);
                data.put("webWindowY", inWindow[1]);
                WindowInsets insets = web.getRootWindowInsets();
                if (insets == null) throw new IllegalStateException("Native root insets unavailable.");
                data.put("statusBars", insetJson(insets.getInsets(WindowInsets.Type.statusBars())));
                data.put("navigationBars", insetJson(insets.getInsets(WindowInsets.Type.navigationBars())));
                data.put("systemGestures", insetJson(insets.getInsets(WindowInsets.Type.systemGestures())));
                data.put("ime", insetJson(insets.getInsets(WindowInsets.Type.ime())));
                nativeResult.set(data);
            } catch (Exception error) {
                failure.set(error);
            }
        });
        if (failure.get() != null) throw failure.get();
        CountDownLatch ready = new CountDownLatch(1);
        AtomicReference<String> encoded = new AtomicReference<>();
        // The invisible element measures CSS env without reading reminders or changing visible layout.
        String expression = layoutExpression();
        instrumentation.runOnMainSync(() -> web.evaluateJavascript(expression, value -> {
            encoded.set(value);
            ready.countDown();
        }));
        if (!ready.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Inset measurement timed out.");
        String json = new JSONArray("[" + encoded.get() + "]").getString(0);
        JSONObject result = nativeResult.get();
        JSONObject css = new JSONObject(json);
        result.put("css", css);
        double scale = LabCaptureGeometry.conversionScale(
            result.getDouble("webWidth"), css.getDouble("visualWidth"),
            css.getDouble("visualScale"), css.getDouble("visualOffsetLeft"), css.getDouble("visualOffsetTop")
        );
        result.put("surface", "web");
        result.put("webClearanceClaim", result.getBoolean("webWindowFocused"));
        result.put("cssToPhysicalScale", scale);
        double safeBottom = result.getDouble("rootBottom") - result.getJSONObject("navigationBars").getDouble("bottom");
        double safeTop = result.getDouble("rootTop") + result.getJSONObject("statusBars").getDouble("top");
        for (String group : new String[]{"header", "navigation", "dialog"}) {
            JSONArray controls = css.getJSONArray(group);
            boolean clear = controls.length() > 0;
            for (int index = 0; index < controls.length(); index++) {
                JSONObject control = controls.getJSONObject(index);
                double top = result.getDouble("webY") + control.getDouble("top") * scale;
                double bottom = result.getDouble("webY") + control.getDouble("bottom") * scale;
                if (!LabCaptureGeometry.clearsVerticalBars(top, bottom, safeTop, safeBottom)) clear = false;
            }
            result.put(group + "Measured", controls.length());
            result.put(group + "ClearOfSystemBar", clear);
        }
        return result;
    }

    /** Return only viewport and control geometry; no reminder text or account content is exported. */
    private static String layoutExpression() {
        return String.join("\n",
            "JSON.stringify((() => {",
            "  const probe = document.createElement('div');",
            "  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';",
            "  document.body.appendChild(probe);",
            "  const style = getComputedStyle(probe);",
            "  const top = parseFloat(style.paddingTop);",
            "  const bottom = parseFloat(style.paddingBottom);",
            "  probe.remove();",
            "  const visible = el => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0 && r.width > 0 && r.height > 0; };",
            "  const dialogs = Array.from(document.querySelectorAll('[role=dialog]')).filter(visible);",
            "  const currentDialog = dialogs[dialogs.length - 1];",
            "  const dialog = currentDialog ? Array.from(currentDialog.querySelectorAll('button,a,input,select,[role=button]')).filter(visible).map(el => { const r = el.getBoundingClientRect(); return {top:r.top,bottom:r.bottom}; }) : [];",
            "  const links = Array.from(document.querySelectorAll('a'));",
            "  const destinations = ['/', '/upcoming', '/notes', '/history', '/settings'];",
            "  const header = links.filter(a => a.getAttribute('href') === '/help' || (a.getAttribute('href') === '/' && a.innerText === 'Persistent'))",
            "    .filter(visible).map(a => a.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0).map(r => ({top:r.top,bottom:r.bottom}));",
            "  const nativeStyle = getComputedStyle(document.documentElement);",
            "  const nativeTop = nativeStyle.getPropertyValue('--native-safe-area-inset-top');",
            "  const nativeBottom = nativeStyle.getPropertyValue('--native-safe-area-inset-bottom');",
            "  const navigation = links.filter(a => visible(a) && destinations.includes(a.getAttribute('href')))",
            "    .map(a => ({a,r:a.getBoundingClientRect()})).filter(({r}) => r.width > 0 && r.height > 0 && r.top > innerHeight / 2)",
            "    .map(({a,r}) => ({destination:a.getAttribute('href'),top:r.top,bottom:r.bottom}));",
            "  return {cssInsetTop:top,cssInsetBottom:bottom,nativeTop,nativeBottom,header,dialog,innerWidth,innerHeight,devicePixelRatio,visualWidth:visualViewport?.width??null,visualScale:visualViewport?.scale??null,visualHeight:visualViewport?.height??null,visualOffsetLeft:visualViewport?.offsetLeft??null,visualOffsetTop:visualViewport?.offsetTop??null,navigation};",
            "})())"
        );
    }

    /** Keep physical-pixel inset dimensions explicit in diagnostic evidence. */
    private static JSONObject insetJson(Insets insets) throws Exception {
        return new JSONObject().put("left", insets.left).put("top", insets.top)
            .put("right", insets.right).put("bottom", insets.bottom);
    }
}
