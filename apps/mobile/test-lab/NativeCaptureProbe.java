package ca.persistent.app.capture;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** One bounded diagnostic on a disposable synthetic install, never a curated capture recipe. */
@RunWith(AndroidJUnit4.class)
public final class NativeCaptureProbe {
    private Instrumentation instrumentation;
    private UiDevice device;
    private WebView web;
    private File output;
    private final JSONArray samples = new JSONArray();
    private long startedAt;
    private JSONObject nativeReadiness = new JSONObject();
    private static final String[] TITLES = {"Water the plants", "Feed the puppy", "Get out the door", "Take vitamin D", "Done", "Snooze"};

    /** Record native visibility and command outcomes before changing the carousel readiness policy. */
    @Test public void diagnoseNativeSurfaces() throws Exception {
        startedAt = android.os.SystemClock.elapsedRealtime();
        instrumentation = InstrumentationRegistry.getInstrumentation();
        device = UiDevice.getInstance(instrumentation);
        String origin = InstrumentationRegistry.getArguments().getString("demoOrigin", "");
        if (!origin.matches("https://[a-zA-Z0-9.-]+") || origin.contains("persistent.dynamic-solutions.ca")
            || !"ca.persistent.app".equals(instrumentation.getTargetContext().getPackageName())) {
            throw new IllegalArgumentException("Disposable isolated demo required.");
        }
        output = new File(instrumentation.getTargetContext().getExternalFilesDir(Environment.DIRECTORY_PICTURES), "store-captures");
        if (!output.isDirectory() && !output.mkdirs()) throw new IllegalStateException("Cannot create diagnostic directory.");
        try {
            // Same reviewed disposable grants as the capture runner. No unrelated provider writes.
            shell("cmd alarm set-timezone America/Toronto");
            shell("pm grant ca.persistent.app android.permission.POST_NOTIFICATIONS");
            shell("appops set ca.persistent.app SCHEDULE_EXACT_ALARM allow");
            shell("appops set ca.persistent.app USE_FULL_SCREEN_INTENT allow");
            shell("appops set ca.persistent.app SYSTEM_ALERT_WINDOW allow");
            shell("cmd deviceidle whitelist +ca.persistent.app");
            Intent intent = instrumentation.getTargetContext().getPackageManager().getLaunchIntentForPackage("ca.persistent.app");
            if (intent == null) throw new IllegalStateException("Missing launcher.");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Activity activity = instrumentation.startActivitySync(intent);
            if (!(activity instanceof BridgeActivity)) throw new IllegalStateException("Missing bridge.");
            instrumentation.runOnMainSync(() -> {
                activity.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                web = ((BridgeActivity) activity).getBridge().getWebView();
            });
            waitJs("location.origin === " + JSONObject.quote(origin) + " && document.readyState === 'complete'", 45000);
            js("localStorage.setItem('persistent-play-migration-notice-seen','1'); window.__probeReady=false; (async()=>{try { const email='ryan.ewen+persistentdemo@gmail.com'; const health=await fetch('/api/health'); if(!health.ok || !(await health.json()).ok)return; const requested=await fetch('/api/auth/request-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}); const code=(await requested.json()).previewCode; if(!code)return; const verified=await fetch('/api/auth/verify-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,code})}); if(!verified.ok)return; const me=await (await fetch('/api/auth/me')).json(); if((me.user?.email??me.email)!==email)return; window.__probeReady=true; }catch(_){} })(); true");
            waitJs("window.__probeReady === true", 30000);
            js("window.__probeAlarmReady=null; (async()=>{try {window.__probeAlarmReady=await Capacitor.Plugins.AlarmPlugin.alarmReadiness();}catch(_){window.__probeAlarmReady={readFailed:true};}})(); true");
            waitJs("window.__probeAlarmReady !== null", 15000);
            nativeReadiness = new JSONObject(new JSONArray("[" + js("JSON.stringify(window.__probeAlarmReady)") + "]").getString(0));
            android.os.PowerManager power = (android.os.PowerManager) instrumentation.getTargetContext().getSystemService(android.content.Context.POWER_SERVICE);
            nativeReadiness.put("batteryExempt", power.isIgnoringBatteryOptimizations("ca.persistent.app"));
            js("setTimeout(()=>location.href='/',100); true");
            waitJs("document.body.innerText.includes('Water the plants')", 45000);
            sample("app-initial");
            // Observe transient heads-up lifecycle rather than hiding or dismissing obligations.
            Thread.sleep(12000);
            sample("app-after-transient-window");
            shell("cmd statusbar expand-notifications");
            Thread.sleep(1500);
            sample("shade-initial");
            device.openNotification();
            Thread.sleep(1500);
            sample("shade-uiautomator");
        } finally {
            JSONObject report = new JSONObject();
            report.put("diagnosticOnly", true);
            report.put("uiautomatorVersion", "2.4.0");
            report.put("model", android.os.Build.MODEL);
            report.put("api", android.os.Build.VERSION.SDK_INT);
            report.put("fingerprint", android.os.Build.FINGERPRINT);
            report.put("nativeReadiness", nativeReadiness);
            report.put("samples", samples);
            try (FileOutputStream stream = new FileOutputStream(new File(output, "native-diagnostics.json"))) {
                stream.write(report.toString(2).getBytes(StandardCharsets.UTF_8));
            }
        }
    }

    /** Save selected synthetic-title counts, bounded native structure metadata and original pixels. */
    private void sample(String name) throws Exception {
        JSONObject sample = new JSONObject();
        sample.put("name", name);
        sample.put("elapsedMs", android.os.SystemClock.elapsedRealtime() - startedAt);
        sample.put("layoutInsets", LabCaptureReadiness.measure(instrumentation, web));
        android.accessibilityservice.AccessibilityServiceInfo service = instrumentation.getUiAutomation().getServiceInfo();
        sample.put("accessibilityServiceFlags", service.flags);
        sample.put("accessibilityEventTypes", service.eventTypes);
        sample.put("accessibilityCapabilities", service.getCapabilities());
        sample.put("accessibilityPackageFilter", service.packageNames == null ? JSONObject.NULL : new JSONArray(service.packageNames));
        samples.put(sample);
        JSONArray windows = new JSONArray();
        int windowCount = 0;
        for (AccessibilityWindowInfo window : instrumentation.getUiAutomation().getWindows()) {
            if (windowCount++ >= 32) { window.recycle(); continue; }
            JSONObject entry = new JSONObject();
            entry.put("type", window.getType());
            entry.put("layer", window.getLayer());
            entry.put("active", window.isActive());
            AccessibilityNodeInfo root = window.getRoot();
            entry.put("rootPresent", root != null);
            if (root != null) {
                entry.put("package", String.valueOf(root.getPackageName()));
                entry.put("nodeCountBounded", countNodes(root, 2000, 80));
                JSONObject matches = new JSONObject();
                for (String title : TITLES) matches.put(title, root.findAccessibilityNodeInfosByText(title).size());
                entry.put("selectedTitleMatches", matches);
                root.recycle();
            }
            windows.put(entry);
            window.recycle();
        }
        sample.put("nativeWindows", windows);
        JSONObject matches = new JSONObject();
        for (String title : TITLES) matches.put(title, device.findObjects(By.textContains(title)).size());
        sample.put("uiautomatorSelectedTitleMatches", matches);
        JSONObject systemMatches = new JSONObject();
        for (String title : TITLES) systemMatches.put(title, device.findObjects(By.pkg("com.android.systemui").textContains(title)).size());
        sample.put("systemUiSelectedTitleMatches", systemMatches);
        sample.put("visibleHeadsUpResourceCount", device.findObjects(By.res(java.util.regex.Pattern.compile(".*heads_up.*"))).size());
        // Only known observed providers, read-only. Arbitrary shell output is never exported.
        JSONObject commands = new JSONObject();
        java.util.Set<String> providers = new java.util.TreeSet<>();
        java.util.Collections.addAll(providers, "android", "com.android.systemui", "com.google.android.setupwizard", "com.google.testing.helium.utp.android.companion.backdrop");
        JSONObject activeCounts = new JSONObject();
        String notifications = shell("dumpsys notification");
        int activeStart = notifications.indexOf("Notification List:");
        int activeEnd = activeStart < 0 ? -1 : notifications.indexOf("mMaxPackageEnqueueRate=", activeStart);
        sample.put("activeNotificationSectionIdentified", activeStart >= 0 && activeEnd > activeStart);
        if (activeStart >= 0 && activeEnd > activeStart) {
            java.util.regex.Matcher records = java.util.regex.Pattern.compile("NotificationRecord\\([^\\n]*?\\bpkg=([a-zA-Z0-9_.]+)")
                .matcher(notifications.substring(activeStart, activeEnd));
            while (records.find()) {
                String provider = records.group(1);
                activeCounts.put(provider, activeCounts.optInt(provider) + 1);
                if (providers.size() < 32 && !provider.equals("ca.persistent.app")) providers.add(provider);
            }
        }
        sample.put("activeNotificationProviderCounts", activeCounts);
        for (String provider : providers) {
            String result = shell("appops get " + provider + " POST_NOTIFICATION");
            String category = result.contains("SecurityException") || result.contains("Permission Denial") ? "permission-denied"
                : result.contains("Unknown operation") ? "unsupported-operation"
                : result.contains("Unknown package") ? "unknown-package"
                : result.contains("ignore") ? "ignore" : result.contains("allow") ? "allow"
                : result.contains("No operations") ? "no-recorded-operation" : "other";
            JSONObject command = new JSONObject();
            command.put("category", category);
            java.util.regex.Matcher status = java.util.regex.Pattern.compile("PROBE_EXIT=([0-9]+)").matcher(result);
            command.put("exitStatus", status.find() ? Integer.parseInt(status.group(1)) : -1);
            String permission = shell("dumpsys package " + provider);
            java.util.regex.Matcher notificationPermission = java.util.regex.Pattern.compile(
                "android\\.permission\\.POST_NOTIFICATIONS: granted=(true|false), flags=\\[([^\\]\\n]{0,300})\\]").matcher(permission);
            if (notificationPermission.find()) {
                command.put("notificationPermissionGranted", Boolean.parseBoolean(notificationPermission.group(1)));
                String flags = notificationPermission.group(2);
                command.put("permissionSystemFixed", flags.contains("SYSTEM_FIXED"));
                command.put("permissionPolicyFixed", flags.contains("POLICY_FIXED"));
            }
            commands.put(provider, command);
        }
        sample.put("readOnlyProviderAppOps", commands);
        Bitmap bitmap = instrumentation.getUiAutomation().takeScreenshot();
        if (bitmap == null) throw new IllegalStateException("Missing original screenshot.");
        try (FileOutputStream stream = new FileOutputStream(new File(output, "probe-" + name + ".png"))) {
            if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) throw new IllegalStateException("PNG failed.");
        } finally { bitmap.recycle(); }
    }

    /** Count native descendants with a hard cap so pathological trees cannot stall diagnostics. */
    private int countNodes(AccessibilityNodeInfo root, int limit, int depth) {
        if (depth <= 0) return 1;
        int count = 1;
        for (int index = 0; index < root.getChildCount() && count < limit; index++) {
            AccessibilityNodeInfo child = root.getChild(index);
            if (child != null) { count += countNodes(child, limit - count, depth - 1); child.recycle(); }
        }
        return count;
    }

    /** Read a fixed command's merged error/output and exit code; callers export only safe classifications. */
    private String shell(String command) throws Exception {
        LabShell.Result result = LabShell.execute(instrumentation, command);
        return result.output + "\n" + result.error + "\nPROBE_EXIT=" + result.exitStatus;

    }

    /** Evaluate reviewed demo bootstrap without exporting auth responses or code. */
    private String js(String expression) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> web.evaluateJavascript(expression, value -> { result.set(value); latch.countDown(); }));
        if (!latch.await(15000, TimeUnit.MILLISECONDS)) throw new IllegalStateException("JavaScript timeout.");
        return result.get();
    }

    /** Bound ordinary auth and page readiness, refusing partial diagnostic setup. */
    private void waitJs(String expression, long timeout) throws Exception {
        long deadline = android.os.SystemClock.elapsedRealtime() + timeout;
        while (android.os.SystemClock.elapsedRealtime() < deadline) {
            if ("true".equals(js("Boolean(" + expression + ")"))) return;
            Thread.sleep(250);
        }
        throw new IllegalStateException("Diagnostic readiness failed.");
    }
}
