package ir.learnbox.app.billing

import android.app.Activity

// Bind target from Bazaar's official IAB v3 guide:
// https://developers.cafebazaar.ir/en/guidelines/in-app-billing/migrate-google-play
fun createBillingBridge(activity: Activity): BillingBridge = AidlBillingBridge(
    activity,
    StoreBilling(
        servicePackage = "com.farsitel.bazaar",
        serviceAction = "ir.cafebazaar.pardakht.InAppBillingService.BIND",
        channel = "android_bazaar",
        tag = "BazaarBilling",
    ),
)
