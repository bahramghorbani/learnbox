package ir.learnbox.app.billing

import android.app.Activity

fun createBillingBridge(activity: Activity): BillingBridge = AidlBillingBridge(
    activity,
    StoreBilling(
        servicePackage = "ir.mservices.market",
        serviceAction = "ir.mservices.market.InAppBillingService.BIND",
        channel = "android_myket",
        tag = "MyketBilling",
    ),
)
