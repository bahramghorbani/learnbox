package ir.learnbox.app

import android.webkit.JavascriptInterface

/**
 * M1/M2: the JS<->native bridge the web app uses for Myket/Bazaar IAB, one build flavor per
 * store (see app/build.gradle.kts "store" flavor dimension and ir.learnbox.app.billing).
 *
 * Response shape mirrors `ZarinpalRequestOutcome` (apps/website/lib/zarinpal.ts):
 * { status: "succeeded" | "rejected" | "error" | "unavailable" | "pending", ... }. A
 * `succeeded` result only means Myket returned a receipt; the website verifies its purchaseToken
 * server-side before granting access. The generic flavor (no billing bridge) and any flavor
 * before its real wiring lands keep answering "unavailable" — honest, never a faked success.
 */
object PurchaseBridgeLogic {
    fun unavailable(): String = """{"status":"unavailable","channel":"${BuildConfig.STORE_CHANNEL}"}"""
}

/** Exposed to the WebView as `window.LearnBoxNative`. Methods must stay pure JSON-in/JSON-out. */
class LearnBoxNativeBridge(private val activity: MainActivity) {
    private val billingBridge = ir.learnbox.app.billing.createBillingBridge(activity)

    @JavascriptInterface
    fun getPlatform(): String = "android"

    /** "android_myket" | "android_bazaar" | "none" — lets the web app pick the store's server route. */
    @JavascriptInterface
    fun getStoreChannel(): String = BuildConfig.STORE_CHANNEL

    /**
     * Returns immediately with "pending" (real store flavors) or "unavailable" (generic / no
     * bridge). The FINAL result arrives later via
     * window.LearnBoxNativeCallbacks.onPurchaseResult(jsonString) on the WebView's JS side —
     * this call can't be synchronous because the store purchase UI is a separate Activity the
     * user interacts with.
     */
    @JavascriptInterface
    fun requestPurchase(sku: String): String {
        val bridge = billingBridge ?: return PurchaseBridgeLogic.unavailable()
        activity.runOnUiThread {
            bridge.launchPurchase(sku) { resultJson -> activity.deliverPurchaseResult(resultJson) }
        }
        return """{"status":"pending","channel":"${BuildConfig.STORE_CHANNEL}"}"""
    }

    fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?): Boolean =
        billingBridge?.onActivityResult(requestCode, resultCode, data) ?: false

    fun dispose() {
        billingBridge?.dispose()
    }
}
