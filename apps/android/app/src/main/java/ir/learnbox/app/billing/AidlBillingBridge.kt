package ir.learnbox.app.billing

import android.app.Activity
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.util.Log
import com.android.vending.billing.IInAppBillingService

private const val API_VERSION = 3
private const val REQUEST_CODE = 4821

/** One Iranian store's IAB v3 AIDL endpoint; each store flavor's BillingBridgeFactory picks one. */
data class StoreBilling(
    val servicePackage: String,
    val serviceAction: String,
    val channel: String,
    val tag: String,
)

/**
 * Real IAB v3 client for Myket and Cafe Bazaar — both speak Google Play's legacy AIDL protocol
 * and differ only in the bind target (Myket:
 * https://myket.ir/kb/pages/in-app-purchase-implementation-steps/, Bazaar:
 * https://developers.cafebazaar.ir/en/guidelines/in-app-billing/migrate-google-play). Launches the
 * purchase intent and hands back the purchase token. The website submits that token to its
 * server-side verifier before granting any entitlement.
 *
 * ponytail: deliberately does NOT verify the purchase signature client-side or call
 * consumePurchase. The server-side store verification endpoint is the entitlement boundary; only
 * it can grant access. Consumption belongs after that endpoint has an explicit store contract.
 */
class AidlBillingBridge(
    private val activity: Activity,
    private val store: StoreBilling,
) : BillingBridge {
    private var service: IInAppBillingService? = null
    private var bound = false
    private var pendingSku: String? = null
    private var pendingCallback: ((String) -> Unit)? = null
    private var pendingAfterConnect: (() -> Unit)? = null

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            service = IInAppBillingService.Stub.asInterface(binder)
            Log.i(store.tag, "Connected to ${store.servicePackage} billing service")
            pendingAfterConnect?.invoke()
            pendingAfterConnect = null
        }

        override fun onServiceDisconnected(name: ComponentName) {
            service = null
        }
    }

    private fun ensureConnected(onReady: () -> Unit) {
        if (service != null) {
            onReady()
            return
        }
        pendingAfterConnect = onReady
        if (!bound) {
            val intent = Intent(store.serviceAction).apply { `package` = store.servicePackage }
            bound = runCatching {
                activity.bindService(intent, connection, Context.BIND_AUTO_CREATE)
            }.getOrDefault(false)
            if (!bound) {
                Log.w(store.tag, "${store.servicePackage} not installed or billing service unavailable")
                pendingAfterConnect = null
                failPending("store_unavailable")
            }
        }
    }

    override fun launchPurchase(sku: String, onResult: (String) -> Unit) {
        pendingSku = sku
        pendingCallback = onResult
        ensureConnected {
            val svc = service ?: return@ensureConnected failPending("store_unavailable")
            val buyIntentBundle = runCatching {
                svc.getBuyIntent(API_VERSION, activity.packageName, sku, "inapp", null)
            }.getOrNull() ?: return@ensureConnected failPending("buy_intent_call_failed")

            val responseCode = buyIntentBundle.getInt("RESPONSE_CODE", -1)
            if (responseCode != 0) {
                failPending("buy_intent_response_$responseCode")
                return@ensureConnected
            }
            val pendingIntent = buyIntentBundle.getParcelable<PendingIntent>("BUY_INTENT")
            if (pendingIntent == null) {
                failPending("buy_intent_missing")
                return@ensureConnected
            }
            runCatching {
                activity.startIntentSenderForResult(
                    pendingIntent.intentSender, REQUEST_CODE, Intent(), 0, 0, 0,
                )
            }.onFailure { failPending("launch_intent_failed") }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != REQUEST_CODE) return false
        val sku = pendingSku
        if (resultCode != Activity.RESULT_OK || data == null) {
            failPending("purchase_cancelled_or_failed")
            return true
        }
        val responseCode = data.getIntExtra("RESPONSE_CODE", -1)
        val purchaseData = data.getStringExtra("INAPP_PURCHASE_DATA")
        val signature = data.getStringExtra("INAPP_DATA_SIGNATURE")
        if (responseCode != 0 || purchaseData == null || signature == null) {
            failPending("purchase_response_$responseCode")
            return true
        }
        // The server verifies this token with the store before granting access.
        val purchaseToken = runCatching {
            org.json.JSONObject(purchaseData).optString("purchaseToken")
        }.getOrDefault("")
        if (purchaseToken.isBlank()) {
            failPending("purchase_token_missing")
            return true
        }
        resolvePending(
            org.json.JSONObject()
                .put("status", "succeeded")
                .put("channel", store.channel)
                .put("sku", sku.orEmpty())
                .put("purchaseToken", purchaseToken)
                .toString(),
        )
        return true
    }

    private fun failPending(reason: String) {
        resolvePending(
            """{"status":"error","channel":"${store.channel}","reason":"$reason","sku":"${pendingSku.orEmpty()}"}""",
        )
    }

    private fun resolvePending(json: String) {
        val cb = pendingCallback
        pendingSku = null
        pendingCallback = null
        cb?.invoke(json)
    }

    override fun dispose() {
        if (bound) {
            runCatching { activity.unbindService(connection) }
            bound = false
        }
        service = null
    }
}
