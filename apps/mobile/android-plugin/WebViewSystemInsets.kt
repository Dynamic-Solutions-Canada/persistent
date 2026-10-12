package ca.persistent.app.alarm

import android.view.View
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.getcapacitor.Bridge
import com.getcapacitor.WebViewListener

/**
 * Supply measured system-bar spacing to hosted web content on older WebViews.
 *
 * WebView before M136 does not expose system bars through CSS safe-area env().
 * Keep the background edge-to-edge and publish only the part of each system bar
 * that overlaps this WebView. Insets remain unconsumed so native keyboard and
 * modern WebView viewport handling continue normally.
 */
object WebViewSystemInsets {
    /** Attach once after the Capacitor bridge exists; republish after navigation or layout changes. */
    @JvmStatic
    fun attach(bridge: Bridge) {
        val webView = bridge.webView
        val decor = bridge.activity.window.decorView
        val content = bridge.activity.findViewById<View>(android.R.id.content)

        fun publish() {
            val insets = ViewCompat.getRootWindowInsets(decor) ?: return
            if (webView.width == 0 || webView.height == 0) return
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val position = IntArray(2)
            webView.getLocationInWindow(position)
            val left = (bars.left - position[0]).coerceIn(0, webView.width)
            val top = (bars.top - position[1]).coerceIn(0, webView.height)
            val right = (position[0] + webView.width - (decor.width - bars.right))
                .coerceIn(0, webView.width)
            val bottom = (position[1] + webView.height - (decor.height - bars.bottom))
                .coerceIn(0, webView.height)

            // Android coordinates are physical pixels; CSS lengths use the page's
            // pixel ratio. max(env(), native) on the web avoids double padding.
            webView.evaluateJavascript(
                "(() => { const ratio = window.devicePixelRatio || 1; " +
                    "const style = document.documentElement.style; " +
                    "for (const [side, pixels] of Object.entries({left:$left, top:$top, right:$right, bottom:$bottom})) " +
                    "style.setProperty('--native-safe-area-inset-' + side, (pixels / ratio) + 'px'); })()",
                null
            )
        }

        ViewCompat.setOnApplyWindowInsetsListener(content) { _, insets ->
            // Wait for adjustResize/layout to settle before measuring the WebView.
            webView.post { publish() }
            insets
        }
        webView.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> publish() }
        bridge.addWebViewListener(object : WebViewListener() {
            override fun onPageLoaded(view: WebView) {
                publish()
            }
        })
        ViewCompat.requestApplyInsets(content)
        webView.post { publish() }
    }
}
