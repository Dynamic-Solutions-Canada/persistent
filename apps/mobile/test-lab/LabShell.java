package ca.persistent.app.capture;

import android.app.Instrumentation;
import android.os.ParcelFileDescriptor;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/** Trusted lab commands through stdin, preserving argument quoting and bounded exit/error evidence. */
final class LabShell {
    /** Safe command outcome. Callers must classify stderr rather than publishing arbitrary output. */
    static final class Result {
        final String output;
        final String error;
        final int exitStatus;
        Result(String output, String error, int exitStatus) {
            this.output = output;
            this.error = error;
            this.exitStatus = exitStatus;
        }
    }

    /** Execute a checked-in command, with concurrent pipe draining and a 15-second deadline. */
    static Result execute(Instrumentation instrumentation, String command) throws Exception {
        // UiAutomation uses Runtime.exec(String), which does not group quoted sh -c arguments.
        // Feeding a script to sh's stdin avoids that parser and retains real shell quoting.
        if (android.os.Build.VERSION.SDK_INT < 34) throw new IllegalArgumentException("Lab command diagnostics require API 34 or newer.");
        ParcelFileDescriptor[] descriptors = instrumentation.getUiAutomation().executeShellCommandRwe("sh");
        CompletableFuture<String> output = drain(descriptors[0]);
        CompletableFuture<String> error = drain(descriptors[2]);
        try (ParcelFileDescriptor.AutoCloseOutputStream input = new ParcelFileDescriptor.AutoCloseOutputStream(descriptors[1])) {
            input.write((command + "\nlab_status=$?\nprintf '\\nPERSISTENT_SHELL_EXIT=%s\\n' \"$lab_status\"\n").getBytes(StandardCharsets.UTF_8));
        }
        try {
            long deadline = android.os.SystemClock.elapsedRealtime() + 15000;
            String text = output.get(15, TimeUnit.SECONDS);
            String stderr = error.get(Math.max(1, deadline - android.os.SystemClock.elapsedRealtime()), TimeUnit.MILLISECONDS);
            java.util.regex.Matcher marker = java.util.regex.Pattern.compile("\\nPERSISTENT_SHELL_EXIT=([0-9]+)\\s*$").matcher(text);
            if (!marker.find()) throw new IllegalStateException("Lab shell exit marker missing.");
            return new Result(text.substring(0, marker.start()), stderr, Integer.parseInt(marker.group(1)));
        } finally {
            // Closing descriptors also unblocks drain threads when a command exceeds its deadline.
            for (ParcelFileDescriptor descriptor : descriptors) try { descriptor.close(); } catch (Exception ignored) { }
        }
    }

    /** Drain a pipe without blocking its peer, refusing unexpectedly large diagnostic output. */
    private static CompletableFuture<String> drain(ParcelFileDescriptor descriptor) {
        return CompletableFuture.supplyAsync(() -> {
            try (ParcelFileDescriptor.AutoCloseInputStream input = new ParcelFileDescriptor.AutoCloseInputStream(descriptor)) {
                java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int length;
                while ((length = input.read(buffer)) != -1) {
                    if (bytes.size() + length > 2_000_000) throw new IllegalStateException("Lab shell output exceeds bound.");
                    bytes.write(buffer, 0, length);
                }
                return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
            } catch (Exception failure) {
                throw new IllegalStateException("Lab shell pipe read failed.");
            }
        });
    }
}
