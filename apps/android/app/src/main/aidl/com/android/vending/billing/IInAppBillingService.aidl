// Myket's in-app billing service speaks Google Play's IAB v3 AIDL protocol verbatim
// (same package name, same method signatures) — this file is Myket's own documented
// integration step, not something we invented. See:
// https://myket.ir/kb/pages/in-app-purchase-implementation-steps/
package com.android.vending.billing;

interface IInAppBillingService {
    int isBillingSupported(int apiVersion, String packageName, String type);

    Bundle getSkuDetails(int apiVersion, String packageName, String type, in Bundle skusBundle);

    Bundle getBuyIntent(int apiVersion, String packageName, String sku, String type,
            String developerPayload);

    Bundle getPurchases(int apiVersion, String packageName, String type,
            String continuationToken);

    int consumePurchase(int apiVersion, String packageName, String purchaseToken);

    // Cafe Bazaar extensions, in Bazaar's own transaction order (Poolakey's AIDL). Appended after
    // consumePurchase so the five shared transaction codes above are unchanged; only the Bazaar
    // flavor ever calls these (StoreBilling.modernBuyIntent).
    Bundle getBuyIntentV2(int apiVersion, String packageName, String sku, String type,
            String developerPayload);
    Bundle getPurchaseConfig(int apiVersion);
    Bundle getBuyIntentV3(int apiVersion, String packageName, String sku,
            String developerPayload, in Bundle extraData);
}
