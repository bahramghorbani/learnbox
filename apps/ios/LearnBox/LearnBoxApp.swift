import SwiftUI
import WebKit

/// The whole iOS app is one WKWebView on the production Learner PWA, like the Android shell
/// (apps/android/.../MainActivity.kt). Only the Sibapp purchase hand-off is native.
@main
struct LearnBoxApp: App {
    @StateObject private var shell = WebShell()

    var body: some Scene {
        WindowGroup {
            WebShellView(shell: shell)
                .background(Color(red: 0x6B / 255, green: 0x4B / 255, blue: 0xD8 / 255))
                .onOpenURL { shell.handleReturn($0) }
        }
    }
}

struct WebShellView: UIViewRepresentable {
    let shell: WebShell
    func makeUIView(context: Context) -> WKWebView { shell.webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

final class WebShell: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    private static let home = URL(string: "https://\(SibappPurchase.appHost)")!
    let webView: WKWebView
    /// SKU of the purchase handed to Sibapp, echoed back so the page can match the result.
    /// ponytail: in-memory only — if iOS kills the app while Sibapp is open the page state is
    /// gone too; recovery is server-side (Sibapp "purchases by phone number"), not here.
    private var pendingSku: String?

    override init() {
        let config = WKWebViewConfiguration()
        config.userContentController.addUserScript(WKUserScript(
            source: SibappPurchase.bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        config.userContentController.add(self, name: "learnboxPurchase")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.load(URLRequest(url: Self.home))
    }

    // MARK: purchase

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        // Only our own origin may start a purchase.
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "https",
              message.frameInfo.securityOrigin.host == SibappPurchase.appHost,
              let sku = message.body as? String
        else { return }
        guard let url = SibappPurchase.purchaseURL(package: sku) else {
            return deliver(SibappPurchase.resultJSON(status: "error", sku: sku))
        }
        pendingSku = sku
        UIApplication.shared.open(url) { [weak self] opened in
            guard !opened else { return }
            self?.pendingSku = nil
            // Sibapp app not installed (or blocked): honest failure, never a faked success.
            self?.deliver(SibappPurchase.resultJSON(status: "unavailable", sku: sku))
        }
    }

    func handleReturn(_ url: URL) {
        guard let purchaseId = SibappPurchase.purchaseId(from: url) else { return }
        let sku = pendingSku
        pendingSku = nil
        deliver(SibappPurchase.resultJSON(status: "succeeded", sku: sku, purchaseToken: purchaseId))
    }

    private func deliver(_ resultJSON: String) {
        DispatchQueue.main.async {
            self.webView.evaluateJavaScript(SibappPurchase.callbackScript(resultJSON))
        }
    }

    // MARK: navigation

    /// Our site stays in the web view; everything else (tel:, mailto:, t.me, other sites)
    /// opens in the system handler.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, action.targetFrame?.isMainFrame != false else {
            return decisionHandler(.allow)
        }
        let host = url.host?.lowercased() ?? ""
        let ours = url.scheme == "https" && (host == "learnboxapp.com" || host.hasSuffix(".learnboxapp.com"))
        if ours || url.scheme == "about" { return decisionHandler(.allow) }
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    /// target=_blank links: no popups, hand them to the policy above.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { UIApplication.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showOffline()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { showOffline() }
    }

    private func showOffline() {
        webView.loadHTMLString("""
        <!doctype html><html lang="fa" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1">
        <body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-family:-apple-system,sans-serif;background:#6b4bd8;color:#fff;text-align:center;gap:16px">
        <p style="font-size:18px;margin:0 24px">اتصال به اینترنت برقرار نیست.</p>
        <a href="\(Self.home.absoluteString)" style="color:#6b4bd8;background:#fff;padding:12px 28px;border-radius:12px;
        text-decoration:none;font-size:17px">تلاش دوباره</a></body></html>
        """, baseURL: nil)
    }
}
