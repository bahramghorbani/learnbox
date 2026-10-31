# LearnBox iOS (Sibapp)

One WKWebView on `https://app.learnboxapp.com`, same as `apps/android`. Only native part: the
Sibapp in-app purchase hand-off (`LearnBox/SibappPurchase.swift`).

- Bundle id `ir.learnbox.app`, return scheme `learnbox://` (must match the Sibapp panel).
- Page API: `window.LearnBoxNative.getStoreChannel() === 'ios_sibapp'`,
  `requestPurchase(sibappPackageId)` → `pending`; result via
  `window.LearnBoxNativeCallbacks.onPurchaseResult(json)` with `purchaseToken` = Sibapp purchase_id.
  The server must validate it with Sibapp before granting anything.
- Check: `apps/ios/check.sh`. Build: open `LearnBox.xcodeproj` in Xcode; release IPA is made with
  Sibapp's «SibApp Export» tool (no Apple developer account needed).
