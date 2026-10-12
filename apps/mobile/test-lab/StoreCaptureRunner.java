package ca.persistent.app.capture;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Test-only capture runner. Recipes operate only after a synthetic-account ownership check. */
public final class StoreCaptureRunner extends Instrumentation {
    private Bundle arguments;
    private WebView webView;
    private UiDevice device;
    private ActivityMonitor alarmMonitor;
    private String phase = "setup";
    private int actionIndex = -1;
    private String captureName = "none";
    private final java.util.Set<String> suppressedProviders = new java.util.TreeSet<>();
    private final java.util.Set<String> protectedProviders = new java.util.TreeSet<>();

    @Override public void onCreate(Bundle args) {
        super.onCreate(args);
        arguments = args;
        start();
    }

    /** Runs one ordered recipe, returning failure instead of exporting an uncertain capture. */
    @Override public void onStart() {
        Bundle status = new Bundle();
        status.putString("class", getClass().getName());
        status.putString("test", "captureStoreScreens");
        status.putInt("numtests", 1);
        status.putInt("current", 1);
        sendStatus(1, status);
        try {
            device = UiDevice.getInstance(this);
            alarmMonitor = addMonitor("ca.persistent.app.alarm.AlarmActivity", null, false);
            android.accessibilityservice.AccessibilityServiceInfo service = getUiAutomation().getServiceInfo();
            service.flags |= android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
                | android.accessibilityservice.AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS;
            getUiAutomation().setServiceInfo(service);
            String origin = arguments.getString("demoOrigin", "");
            if (!origin.startsWith("https://") || origin.contains("persistent.dynamic-solutions.ca")) {
                throw new IllegalArgumentException("An isolated HTTPS demo origin is required.");
            }
            phase = "disposable-native-permission-grants";
            String appPackage = getTargetContext().getPackageName();
            if (!"ca.persistent.app".equals(appPackage)) throw new IllegalStateException("A direct demo build is required.");
            // These grants affect only the disposable lab install, never Ryan's device or Store app.
            shell("cmd alarm set-timezone America/Toronto");
            if (android.os.Build.VERSION.SDK_INT >= 33) shell("pm grant " + appPackage + " android.permission.POST_NOTIFICATIONS");
            if (android.os.Build.VERSION.SDK_INT >= 31) shell("appops set " + appPackage + " SCHEDULE_EXACT_ALARM allow");
            if (android.os.Build.VERSION.SDK_INT >= 34) shell("appops set " + appPackage + " USE_FULL_SCREEN_INTENT allow");
            shell("appops set " + appPackage + " SYSTEM_ALERT_WINDOW allow");
            suppressOtherNotifications();
            shell("cmd deviceidle whitelist +" + appPackage);
            android.os.PowerManager power = (android.os.PowerManager) getTargetContext().getSystemService(android.content.Context.POWER_SERVICE);
            if (!power.isIgnoringBatteryOptimizations(appPackage)) throw new IllegalStateException("Disposable battery exemption was not granted.");
            Intent intent = getTargetContext().getPackageManager()
                .getLaunchIntentForPackage(getTargetContext().getPackageName());
            if (intent == null) throw new IllegalStateException("No app launcher.");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Activity activity = startActivitySync(intent);
            if (!(activity instanceof BridgeActivity)) throw new IllegalStateException("No Capacitor activity.");
            runOnMainSync(() -> {
                activity.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                webView = ((BridgeActivity) activity).getBridge().getWebView();
            });
            phase = "isolated-origin-loaded";
            waitFor("location.origin === " + JSONObject.quote(origin) + " && document.readyState === 'complete'", 45_000);
            phase = "isolated-json-health";
            evaluate("window.__captureTransportReady = false; (async () => { try { const r = await fetch('/api/health'); window.__captureTransportReady = r.ok && r.headers.get('content-type')?.includes('application/json') && (await r.json()).ok === true; } catch (_) {} })(); true");
            waitFor("window.__captureTransportReady === true", 15_000);
            // The retired direct-build notice is unrelated to these current product screenshots.
            evaluate("localStorage.setItem('persistent-play-migration-notice-seen', '1'); true");
            // Ordinary development sign-in provides no secret in instrumentation arguments or logs.
            phase = "synthetic-account-sign-in";
            evaluate("window.__captureLogin = false; (async () => { try { const email = 'ryan.ewen+persistentdemo@gmail.com'; const r = await fetch('/api/auth/request-code', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}); const code = (await r.json()).previewCode; if (!code) throw Error('No development preview'); const v = await fetch('/api/auth/verify-code', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,code})}); if (!v.ok) throw Error('Sign-in failed'); const me = await (await fetch('/api/auth/me')).json(); window.__captureLogin = (me.user?.email ?? me.email) === email ? true : 'Wrong account'; } catch (_) { window.__captureLogin = 'Demo sign-in failed'; } })(); true");
            waitFor("window.__captureLogin === true", 30_000);
            phase = "synthetic-account-announcement-onboarding";
            evaluate("window.__captureOnboarded = false; (async () => { try { const r = await fetch('/api/announcements'); if (!r.ok) throw Error('Announcement read failed'); const data = await r.json(); for (const item of data.announcements) { const viewed = await fetch('/api/announcements/' + encodeURIComponent(item.id) + '/viewed', {method:'POST'}); if (!viewed.ok) throw Error('Announcement view failed'); } window.__captureOnboarded = true; } catch (_) {} })(); true");
            waitFor("window.__captureOnboarded === true", 15_000);
            phase = "native-alarm-readiness";
            evaluate("window.__captureNativeReady = false; (async () => { try { const r = await Capacitor.Plugins.AlarmPlugin.alarmReadiness(); window.__captureNativeReady = r.notifications === true && r.fullScreen === true && r.exactAlarms === true && r.overlay === true; } catch (_) {} })(); true");
            waitFor("window.__captureNativeReady === true", 15_000);

            phase = "read-reviewed-capture-plan";
            String planPath = arguments.getString("capturePlan", "/data/local/tmp/persistent-capture-plan.json");
            if (!planPath.matches("/data/local/tmp/[a-zA-Z0-9_.-]+\\.json")) throw new IllegalArgumentException("Invalid capture plan path.");
            JSONArray steps = new JSONObject(shell("cat " + planPath)).getJSONArray("steps");
            File output = new File(getTargetContext().getExternalFilesDir(Environment.DIRECTORY_PICTURES), "store-captures");
            if (!output.isDirectory() && !output.mkdirs()) throw new IllegalStateException("Cannot create output directory.");
            writeProvenance(output);
            for (int index = 0; index < steps.length(); index++) {
                JSONObject step = steps.getJSONObject(index);
                actionIndex = index;
                captureName = "none";
                String action = step.getString("action");
                if (!java.util.Arrays.asList("javascript", "wait", "wait-native", "shell", "capture", "expand-notifications").contains(action)) {
                    phase = "invalid-recipe-action";
                    throw new IllegalArgumentException("Unknown recipe action.");
                }
                phase = "recipe-" + action;
                switch (action) {
                    case "javascript": evaluate(step.getString("expression")); break;
                    case "wait": waitFor(step.getString("expression"), step.optLong("timeoutMs", 15_000)); break;
                    case "wait-native": waitForNative(step.getString("text"), step.optLong("timeoutMs", 15_000)); break;
                    case "shell": shell(step.getString("command")); break;
                    case "expand-notifications": expandReminderNotifications(); break;
                    case "capture":
                        String name = step.getString("name");
                        if (!name.matches("[a-z0-9-]+\\.png")) throw new IllegalArgumentException("Invalid capture name.");
                        captureName = name;
                        suppressOtherNotifications();
                        writeProvenance(output);
                        captureGuarded(output, step);
                        break;
                    default: throw new IllegalArgumentException("Unknown recipe action.");
                }
            }
            status.putString("stream", "Captured guarded synthetic store recipe.\n");
            sendStatus(0, status);
            Bundle result = new Bundle();
            result.putString("stream", "OK (1 test)\n");
            finish(Activity.RESULT_OK, result);
        } catch (Exception error) {
            // Avoid echoing expressions, login responses, origins with credentials, or arbitrary shell output.
            status.putString("stack", "STORE_CAPTURE_FAILED phase=" + phase
                + " actionIndex=" + actionIndex + " capture=" + captureName
                + " category=" + error.getClass().getSimpleName());
            sendStatus(-2, status);
            Bundle result = new Bundle();
            result.putString("stream", "FAILURES!!! STORE_CAPTURE_FAILED phase=" + phase
                + " actionIndex=" + actionIndex + " capture=" + captureName + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    /** Records build and actual device evidence alongside pixels, without credentials. */
    private void writeProvenance(File directory) throws Exception {
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream stream = getTargetContext().getAssets().open("test-lab-provenance.json")) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
        }
        JSONObject provenance = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        provenance.put("manufacturer", android.os.Build.MANUFACTURER);
        provenance.put("model", android.os.Build.MODEL);
        provenance.put("androidVersion", android.os.Build.VERSION.RELEASE);
        provenance.put("api", android.os.Build.VERSION.SDK_INT);
        provenance.put("deviceFingerprint", android.os.Build.FINGERPRINT);
        provenance.put("disposableBatteryExemption", true);
        provenance.put("notificationCleanupAction", "POST_NOTIFICATION ignore on identified disposable non-Persistent providers only");
        provenance.put("suppressedNotificationProviders", new JSONArray(suppressedProviders));
        provenance.put("protectedNotificationProviders", new JSONArray(protectedProviders));
        try (FileOutputStream stream = new FileOutputStream(new File(directory, "provenance.json"))) {
            stream.write(provenance.toString(2).getBytes(StandardCharsets.UTF_8));
        }
    }

    /** Evaluates on the UI thread and waits at most 15 seconds for a serializable result. */
    private String evaluate(String expression) throws Exception {
        CountDownLatch ready = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        runOnMainSync(() -> webView.evaluateJavascript(expression, value -> { result.set(value); ready.countDown(); }));
        if (!ready.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("WebView evaluation timed out.");
        return result.get();
    }

    /** Polls an explicit UI readiness assertion instead of treating a fixed delay as evidence. */
    private void waitFor(String expression, long timeoutMs) throws Exception {
        if (timeoutMs < 1 || timeoutMs > 180_000) throw new IllegalArgumentException("Invalid readiness timeout.");
        long deadline = android.os.SystemClock.elapsedRealtime() + timeoutMs;
        while (android.os.SystemClock.elapsedRealtime() < deadline) {
            if ("true".equals(evaluate("Boolean(" + expression + ")"))) return;
            Thread.sleep(250);
        }
        throw new IllegalStateException("UI readiness assertion failed.");
    }

    /** Waits for real native text, including when an alarm covers the WebView. */
    private void waitForNative(String text, long timeoutMs) throws Exception {
        if (timeoutMs < 1 || timeoutMs > 180_000) throw new IllegalArgumentException("Invalid native timeout.");
        long deadline = android.os.SystemClock.elapsedRealtime() + timeoutMs;
        while (android.os.SystemClock.elapsedRealtime() < deadline) {
            // Actual lab evidence: remote find-by-text returned zero for visible shade titles,
            // while UI Automator's native traversal found each unique reminder on the same pixels.
            if (!device.findObjects(By.textContains(text)).isEmpty()) return;
            Thread.sleep(250);
        }
        throw new IllegalStateException("Native readiness assertion failed.");
    }

    /** Expand only the known synthetic notification group/card, never a completion or dismissal action. */
    private void expandReminderNotifications() throws Exception {
        waitForNative("Water the plants", 15000);
        if (device.findObjects(By.text("Done")).isEmpty()) clickClosestExpand("Persistent");
        Thread.sleep(500);
        if (device.findObjects(By.text("Done")).isEmpty()) clickClosestExpand("Water the plants");
        waitForNative("Done", 15000);
        waitForNative("Snooze", 15000);
    }

    /** Find a notification's nearest real expand button, refusing unrelated actions or unknown structure. */
    private void clickClosestExpand(String label) throws Exception {
        androidx.test.uiautomator.UiObject2 anchor = device.findObject(By.pkg("com.android.systemui").textContains(label));
        if (anchor == null) throw new IllegalStateException("Synthetic notification anchor missing.");
        androidx.test.uiautomator.UiObject2 parent = anchor;
        for (int depth = 0; depth < 6 && parent != null; depth++) {
            androidx.test.uiautomator.UiObject2 expand = parent.findObject(By.res(java.util.regex.Pattern.compile("(?:android|com\\.android\\.systemui):id/expand_button")));
            if (expand != null) {
                expand.click();
                return;
            }
            parent = parent.getParent();
        }
        throw new IllegalStateException("Native notification expand control missing.");
    }

    /** Export only after sustained clear readiness and a second check of the captured interval. */
    private void captureGuarded(File output, JSONObject step) throws Exception {
        String name = step.getString("name");
        String surface = step.getString("surface");
        if (!java.util.Arrays.asList("web", "shade", "alarm").contains(surface)) {
            throw new IllegalArgumentException("Unknown capture surface.");
        }
        boolean appCapture = !"shade".equals(surface);
        long deadline = android.os.SystemClock.elapsedRealtime() + 30_000;
        while (android.os.SystemClock.elapsedRealtime() < deadline) {
            if (appCapture) LabCaptureReadiness.waitForStableApp(this, device, deadline);
            getUiAutomation().waitForIdle(500, 5_000);
            if (appCapture && !LabCaptureReadiness.isAppClear(this, device)) continue;
            JSONObject layout = measureSurface(step);
            layout.put("sustainedClearWindowMs", appCapture ? 2000 : JSONObject.NULL);
            layout.put("postCaptureOverlayChecks", appCapture ? 3 : 0);
            Bitmap image = getUiAutomation().takeScreenshot();
            if (image == null) throw new IllegalStateException("No compositor screenshot.");
            try {
                // Check the actual requested surface again after capture; neither an alarm
                // nor a shade image can be vouched for by a covered MainActivity WebView.
                boolean stillReady = true;
                for (int sample = 0; sample < 3; sample++) {
                    if (appCapture && !LabCaptureReadiness.isAppClear(this, device)) stillReady = false;
                    Thread.sleep(200);
                }
                if (!stillReady) continue;
                JSONObject after = measureSurface(step);
                layout.put("postCaptureSurface", after);
                writeLayout(output, name, layout);
                try (FileOutputStream stream = new FileOutputStream(new File(output, name))) {
                    if (!image.compress(Bitmap.CompressFormat.PNG, 100, stream)) throw new IllegalStateException("PNG encoding failed.");
                }
                return;
            } finally {
                image.recycle();
            }
        }
        throw new IllegalStateException("Bounded capture window did not remain clear.");
    }

    /** Require explicitly selected web control groups or actual native controls, never filename policy. */
    private JSONObject measureSurface(JSONObject step) throws Exception {
        String surface = step.getString("surface");
        if ("shade".equals(surface)) return LabNativeSurfaceReadiness.measureShade(this, device);
        if ("alarm".equals(surface)) {
            String title = step.getString("reminderTitle");
            if (title.trim().isEmpty()) throw new IllegalArgumentException("Native alarm title is required.");
            return LabNativeSurfaceReadiness.measureAlarm(this, device, alarmMonitor.getLastActivity(), title);
        }
        if (!"web".equals(surface)) throw new IllegalArgumentException("Unknown capture surface.");
        JSONArray required = step.getJSONArray("requiredControls");
        if (required.length() < 1 || required.length() > 3) throw new IllegalArgumentException("Required web control groups missing.");
        java.util.Set<String> groups = new java.util.HashSet<>();
        JSONObject measured = LabCaptureReadiness.measure(this, webView);
        if (!measured.getBoolean("webWindowFocused")) throw new IllegalStateException("Web capture does not own the visible window.");
        for (int index = 0; index < required.length(); index++) {
            String group = required.getString(index);
            if (!java.util.Arrays.asList("header", "navigation", "dialog").contains(group) || !groups.add(group)) {
                throw new IllegalArgumentException("Unknown or repeated required web control group.");
            }
            if (measured.getInt(group + "Measured") < 1 || !measured.getBoolean(group + "ClearOfSystemBar")) {
                throw new IllegalStateException("Required web controls missing or overlap system bars.");
            }
        }
        measured.put("requiredControls", required);
        return measured;
    }

    /** Persist measured insets beside accepted pixels or a rejected layout, without personal content. */
    private void writeLayout(File output, String name, JSONObject layout) throws Exception {
        try (FileOutputStream stream = new FileOutputStream(new File(output, name.replace(".png", "-layout.json")))) {
            stream.write(layout.toString(2).getBytes(StandardCharsets.UTF_8));
        }
    }

    /** Disable only notification posting for identified lab-device providers, preserving Persistent and OS chrome. */
    private void suppressOtherNotifications() throws Exception {
        String dump = shell("dumpsys notification");
        int start = dump.indexOf("Notification List:");
        if (start < 0) {
            if (dump.contains("Current Notification Manager state")) return;
            throw new IllegalStateException("Cannot identify active notification providers.");
        }
        // Android 15 omits an empty enqueued section; the next settings field always bounds active records.
        int end = dump.indexOf("mMaxPackageEnqueueRate=", start);
        if (end < 0) throw new IllegalStateException("Cannot bound active notification providers.");
        String active = dump.substring(start, end);
        java.util.regex.Matcher records = java.util.regex.Pattern.compile("NotificationRecord\\([^\\n]*?\\bpkg=([a-zA-Z0-9_.]+)").matcher(active);
        while (records.find()) {
            String provider = records.group(1);
            if (provider.startsWith("ca.persistent.app")) continue;
            if (!provider.matches("(?:com\\.android\\.|com\\.google\\.android\\.|androidx\\.test\\.)[a-zA-Z0-9_.]+")) {
                protectedProviders.add(provider);
                continue;
            }
            if (suppressedProviders.contains(provider)) continue;
            shell("appops set " + provider + " POST_NOTIFICATION ignore");
            if (!shell("appops get " + provider + " POST_NOTIFICATION").contains("ignore")) {
                protectedProviders.add(provider);
                continue;
            }
            suppressedProviders.add(provider);
        }
    }

    /** Executes a trusted checked-in recipe command on the disposable lab device only. */
    private String shell(String command) throws Exception {
        LabShell.Result result = LabShell.execute(this, command);
        if (result.exitStatus != 0) throw new IllegalStateException("Reviewed lab shell command failed.");
        return result.output;

    }
}
