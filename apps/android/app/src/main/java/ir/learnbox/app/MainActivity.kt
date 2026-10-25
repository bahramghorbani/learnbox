package ir.learnbox.app

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * M0: the whole app is this one screen. A WebView loads the production Learner PWA as-is —
 * no native rewrite of any screen. Everything that must be editable without a store release
 * (splash image, copy, features) already lives behind app.learnboxapp.com and is served to this
 * WebView exactly like it is to a browser; nothing is bundled into the APK.
 *
 * ponytail: skipped a dedicated native splash Activity/layout. The theme's background color
 * (brand_primary) already paints before onCreate runs, which covers the same "no white flash"
 * need as a splash screen for this one-screen app. Add a real SplashScreen API usage only if a
 * later milestone needs a logo on that first frame, not just a color.
 */
class MainActivity : Activity() {

    private val productionUrl = "https://app.learnboxapp.com"

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Footer nav icons were cut off on some phones, not others: Android 15 (API 35) made
        // edge-to-edge the OS default for some OEM skins even below that targetSdk, so the
        // WebView's content area was drawn UNDER the system gesture/navigation bar on those
        // devices. The web app's CSS already reserves space for the bottom nav via
        // `env(safe-area-inset-bottom)` (apps/website/app/globals.css), but that only works if
        // the WebView actually receives real, non-zero inset values for every OEM — it does not,
        // reliably, in a raw android.webkit.WebView. Fix at the source instead: force Android to
        // always reserve the system bar space itself (`decorFitsSystemWindows = true`, the
        // pre-edge-to-edge default), so the WebView's content area never extends under the
        // system bar on ANY device/OS version, and the website's own safe-area CSS never needs
        // to do anything (insets correctly report as already-excluded, i.e. 0).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(true)
        }

        webView = WebView(this)
        setContentView(webView)

        // M1: expose window.LearnBoxNative to the page. See NativeBridge.kt for why every
        // purchase request currently answers "unavailable" instead of faking a result.
        webView.addJavascriptInterface(LearnBoxNativeBridge(), "LearnBoxNative")

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        // Deliberately NOT setting useWideViewPort/loadWithOverviewMode: those are for legacy
        // desktop-oriented sites with no real viewport meta tag, asking WebView to zoom-to-fit.
        // The site already declares `width=device-width, initial-scale=1`
        // (apps/website/app/layout.tsx) — a real responsive viewport. Forcing the legacy
        // zoom-to-fit flags on top of a real viewport meta is what was causing the bottom nav's
        // label row to render below the fold on some phones: WebView's overview-mode scaling is
        // DPI-dependent, so it clipped only on some densities, not others. Without these two
        // flags WebView just honors the page's own viewport, like a normal mobile browser does.

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView?,
                errorCode: Int,
                description: String?,
                failingUrl: String?,
            ) {
                // ponytail: no retry/offline screen yet — this is the one thing to add before
                // any store submission (reviewers will test with the network off).
                Log.e("LearnBoxWebView", "Load failed ($errorCode) for $failingUrl: $description")
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView.loadUrl(productionUrl)
    }

    /** Back button navigates WebView history first, matching normal browser/PWA behavior. */
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
