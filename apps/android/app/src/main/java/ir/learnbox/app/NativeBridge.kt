package ir.learnbox.app

import android.webkit.JavascriptInterface

/**
 * M1: the JS<->native bridge the web app will use for Cafe Bazaar/Myket IAB, once a real
 * store account exists. For now every purchase request answers "unavailable" — it never
 * fakes a successful purchase. A fake success here would be indistinguishable from a real one
 * to the web app's entitlement code and could grant access with nothing actually bought; an
 * honest "unavailable" is always safe to ship ahead of real store wiring.
 *
 * Response shape intentionally mirrors `ZarinpalRequestOutcome`
 * (apps/website/lib/zarinpal.ts) so the eventual real implementation is a drop-in, not a
 * redesign: { status: "succeeded" | "rejected" | "error" | "unavailable", ... }.
 *
 * ponytail: no real IAB call, no store SDK dependency yet — add both only once the owner
 * provides the Cafe Bazaar developer account and a store-specific milestone is authorized.
 */
object PurchaseBridgeLogic {
    fun handlePurchaseRequest(sku: String): String {
        // sku is accepted (not yet used) so the eventual real handler's signature doesn't change.
        return """{"status":"unavailable"}"""
    }
}

/** Exposed to the WebView as `window.LearnBoxNative`. Methods must stay pure JSON-in/JSON-out. */
class LearnBoxNativeBridge {
    @JavascriptInterface
    fun getPlatform(): String = "android"

    @JavascriptInterface
    fun requestPurchase(sku: String): String = PurchaseBridgeLogic.handlePurchaseRequest(sku)
}
