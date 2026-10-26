package ir.learnbox.app.billing

import android.content.Intent

/**
 * Store-specific real purchase flow. One implementation per store flavor — see
 * BillingBridgeFactory.kt in each flavor's source set (generic/, myket/). The generic flavor's
 * factory returns null (no bridge), which NativeBridge.kt already treats as the honest
 * "unavailable" response.
 */
interface BillingBridge {
    /**
     * Starts the purchase flow for [sku]. [onResult] fires exactly once, always asynchronously
     * (never from inside this call), with the final JSON payload:
     * {"status":"succeeded"|"rejected"|"error","channel":...,...}. A purchase that reaches the
     * device but can't yet be verified server-side must report "error", never "succeeded" — a
     * fake success here is indistinguishable from a real one to the web app's entitlement code.
     */
    fun launchPurchase(sku: String, onResult: (String) -> Unit)

    /** Forward from the hosting Activity's onActivityResult. Returns true if this bridge
     * handled it (i.e. requestCode matched), false if the Activity should handle it itself. */
    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean

    /** Release the store service connection. Call from the hosting Activity's onDestroy. */
    fun dispose()
}
