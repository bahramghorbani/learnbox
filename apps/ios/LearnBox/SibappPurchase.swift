import Foundation

/// Pure Sibapp purchase logic (Foundation only) so `apps/ios/check.sh` can run it with plain
/// `swiftc`, no simulator. Mirrors Android's NativeBridge.kt contract: the page calls
/// `LearnBoxNative.requestPurchase(sku)`, gets `pending` back at once, and the final result
/// arrives later through `window.LearnBoxNativeCallbacks.onPurchaseResult(json)`. A
/// `succeeded` result only carries Sibapp's purchase_id; the website verifies it server-side
/// before granting anything.
enum SibappPurchase {
    static let channel = "ios_sibapp"
    static let appHost = "app.learnboxapp.com"
    static let returnScheme = "learnbox"

    /// Injected at document start. Same surface as Android's `window.LearnBoxNative`.
    static let bridgeScript = """
    window.LearnBoxNative = Object.freeze({
      getPlatform: function () { return 'ios'; },
      getStoreChannel: function () { return '\(channel)'; },
      requestPurchase: function (sku) {
        window.webkit.messageHandlers.learnboxPurchase.postMessage(String(sku));
        return JSON.stringify({ status: 'pending', channel: '\(channel)' });
      }
    });
    """

    /// Sibapp package ids / purchase ids are opaque tokens; only allow what fits safely in a URL.
    static func isSafeId(_ value: String) -> Bool {
        !value.isEmpty && value.count <= 64
            && value.unicodeScalars.allSatisfy { ($0.isASCII && CharacterSet.alphanumerics.contains($0)) || $0 == "-" || $0 == "_" }
    }

    /// `sibapp://package_purchase?package=<id>&developer_payload=` (developer guide, step 1).
    static func purchaseURL(package: String) -> URL? {
        guard isSafeId(package) else { return nil }
        var url = URLComponents()
        url.scheme = "sibapp"
        url.host = "package_purchase"
        url.queryItems = [
            URLQueryItem(name: "package", value: package),
            URLQueryItem(name: "developer_payload", value: ""),
        ]
        return url.url
    }

    /// Sibapp returns with `learnbox://?purchase_id=<id>` (panel «آدرس بازگشت» = `learnbox://`).
    static func purchaseId(from url: URL) -> String? {
        guard url.scheme?.lowercased() == returnScheme,
              let id = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "purchase_id" })?.value,
              isSafeId(id)
        else { return nil }
        return id
    }

    static func resultJSON(status: String, sku: String?, purchaseToken: String? = nil) -> String {
        var body: [String: String] = ["status": status, "channel": channel]
        body["sku"] = sku
        body["purchaseToken"] = purchaseToken
        let data = try! JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
        return String(decoding: data, as: UTF8.self)
    }

    /// JS that hands `resultJSON` to the page as a properly escaped string literal.
    static func callbackScript(_ resultJSON: String) -> String {
        let data = try! JSONSerialization.data(withJSONObject: [resultJSON])
        let literal = String(decoding: data, as: UTF8.self).dropFirst().dropLast()
        return "window.LearnBoxNativeCallbacks && window.LearnBoxNativeCallbacks.onPurchaseResult(\(literal))"
    }
}
