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

        webView = WebView(this)
        setContentView(webView)

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        // The site is responsive and already serves its own mobile layout; this only tells the
        // WebView not to render it as a scaled-down desktop page.
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true

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
