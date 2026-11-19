// Presence marker for the `direct` (sideloaded) flavor. The page checks only that a plugin
// named "Update" is registered (hasNativeUpdater in apps/web/src/native/alarmBridge.ts) and
// then shows the move-to-Google-Play notice. The in-app APK download and install it once
// offered is retired (direct builds are no longer distributed), so it has no methods, and
// the direct manifest no longer asks for REQUEST_INSTALL_PACKAGES (host contract gap #1).
// Lives in the alarm package only because setup-android.mjs copies every plugin .kt there.
package ca.persistent.app.alarm

import com.getcapacitor.Plugin
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "Update")
class UpdatePlugin : Plugin()
