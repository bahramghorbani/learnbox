package ir.learnbox.app

import android.webkit.JavascriptInterface

/**
 * M1/M2: the JS<->native bridge the web app will use for Myket/Bazaar IAB, one build flavor
 * per store (see app/build.gradle.kts "store" flavor dimension). For now every purchase
 * request still answers "unavailable" — it never fakes a successful purchase. A fake success
 * here would be indistinguishable from a real one to the web app's entitlement code and could
 * grant access with nothing actually bought; an honest "unavailable" is always safe to ship
 * ahead of real store wiring.
 *
 * Response shape intentionally mirrors `ZarinpalRequestOutcome`
 * (apps/website/lib/zarinpal.ts) so the eventual real implementation is a drop-in, not a
 * redesign: { status: "succeeded" | "rejected" | "error" | "unavailable", ... }.
 *
 * ponytail: no real IAB call, no store SDK dependency yet for ANY flavor — the myket flavor
 * now exists (dev account approved) but real IInAppBillingService wiring needs the app's
 * Myket-panel public key, which only exists after the app is first registered there; the
 * bazaar flavor itself doesn't exist yet (account still pending). Add the real call, per
 * flavor, once each milestone is authorized and testable on a real device.
 */
object PurchaseBridgeLogic {
    fun handlePurchaseRequest(sku: String): String {
        // sku is accepted (not yet used) so the eventual real handler's signature doesn't change.
        // channel reflects which store flavor is asking, even though no flavor can fulfil it yet.
        return """{"status":"unavailable","channel":"${BuildConfig.STORE_CHANNEL}"}"""
    }
}

/** Exposed to the WebView as `window.LearnBoxNative`. Methods must stay pure JSON-in/JSON-out. */
class LearnBoxNativeBridge {
    @JavascriptInterface
    fun getPlatform(): String = "android"

    @JavascriptInterface
    fun requestPurchase(sku: String): String = PurchaseBridgeLogic.handlePurchaseRequest(sku)
}
