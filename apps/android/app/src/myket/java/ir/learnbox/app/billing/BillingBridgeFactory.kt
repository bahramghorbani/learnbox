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

private const val TAG = "MyketBilling"
private const val SERVICE_PACKAGE = "ir.mservices.market"
private const val SERVICE_ACTION = "ir.mservices.market.InAppBillingService.BIND"
private const val API_VERSION = 3
private const val REQUEST_CODE = 4821

fun createBillingBridge(activity: Activity): BillingBridge = MyketBillingBridge(activity)

/**
 * Real Myket IAB v3 client — binds to Myket's service over the AIDL interface Myket documents
 * (https://myket.ir/kb/pages/in-app-purchase-implementation-steps/), launches the purchase
 * intent, and hands back the raw purchase JSON + signature.
 *
 * ponytail: deliberately does NOT verify the purchase signature client-side or call
 * consumePurchase. The real security boundary is server-side verify (Myket's partner
 * verify API, POST .../purchases/products/{sku}/verify with X-Access-Token) — that endpoint
 * doesn't exist in our backend yet because we don't have the partner Access-Token from the
 * Myket panel. Until it does, every completed purchase reports "error" (reason
 * "server_verify_not_configured") with the real purchaseToken attached so support can grant
 * access manually; it NEVER reports "succeeded" on its own, since a fake success here would be
 * indistinguishable from a real one to the web app's entitlement code. Upgrade: add the backend
 * verify endpoint once the Access-Token is in hand, then call it here before reporting
 * "succeeded", and only then call consume().
 */
class MyketBillingBridge(private val activity: Activity) : BillingBridge {
    private var service: IInAppBillingService? = null
    private var bound = false
    private var pendingSku: String? = null
    private var pendingCallback: ((String) -> Unit)? = null
    private var pendingAfterConnect: (() -> Unit)? = null

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            service = IInAppBillingService.Stub.asInterface(binder)
            Log.i(TAG, "Connected to Myket billing service")
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
            val intent = Intent(SERVICE_ACTION).apply { `package` = SERVICE_PACKAGE }
            bound = runCatching {
                activity.bindService(intent, connection, Context.BIND_AUTO_CREATE)
            }.getOrDefault(false)
            if (!bound) {
                Log.w(TAG, "Myket app not installed or billing service unavailable")
                pendingAfterConnect = null
                failPending("myket_unavailable")
            }
        }
    }

    override fun launchPurchase(sku: String, onResult: (String) -> Unit) {
        pendingSku = sku
        pendingCallback = onResult
        ensureConnected {
            val svc = service ?: return@ensureConnected failPending("myket_unavailable")
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
        // Real purchase captured on-device. Can't call it "succeeded" yet — see class doc.
        val purchaseToken = runCatching {
            org.json.JSONObject(purchaseData).optString("purchaseToken")
        }.getOrDefault("")
        resolvePending(
            """{"status":"error","channel":"android_myket","reason":"server_verify_not_configured","sku":"${sku.orEmpty()}","purchaseToken":"$purchaseToken"}""",
        )
        return true
    }

    private fun failPending(reason: String) {
        resolvePending(
            """{"status":"error","channel":"android_myket","reason":"$reason","sku":"${pendingSku.orEmpty()}"}""",
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
