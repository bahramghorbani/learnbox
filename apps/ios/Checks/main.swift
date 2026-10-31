// Run: apps/ios/check.sh — plain swiftc, no simulator needed.
import Foundation

func expect(_ ok: Bool, _ what: String) { if !ok { print("FAIL:", what); exit(1) } }

let pkg = "078d1cf1-a7ba-4c00-b6eb-9dc33ae9399b"
expect(SibappPurchase.purchaseURL(package: pkg)?.absoluteString
       == "sibapp://package_purchase?package=\(pkg)&developer_payload=", "purchase URL shape")
for bad in ["", "a&b=c", "x y", "../x", "پکیج", String(repeating: "a", count: 65)] {
    expect(SibappPurchase.purchaseURL(package: bad) == nil, "rejects package \(bad)")
}
expect(SibappPurchase.purchaseId(from: URL(string: "learnbox://?purchase_id=P-123_x")!) == "P-123_x", "reads purchase_id")
expect(SibappPurchase.purchaseId(from: URL(string: "evil://?purchase_id=P1")!) == nil, "other scheme ignored")
expect(SibappPurchase.purchaseId(from: URL(string: "learnbox://?purchase_id=a%27)%3Balert(1)")!) == nil, "unsafe id rejected")
expect(SibappPurchase.purchaseId(from: URL(string: "learnbox://")!) == nil, "missing id")

let json = SibappPurchase.resultJSON(status: "succeeded", sku: pkg, purchaseToken: "P1")
let obj = try! JSONSerialization.jsonObject(with: Data(json.utf8)) as! [String: String]
expect(obj == ["status": "succeeded", "channel": "ios_sibapp", "sku": pkg, "purchaseToken": "P1"], "result JSON")
expect(!SibappPurchase.resultJSON(status: "unavailable", sku: nil).contains("purchaseToken"), "no token on failure")

// The callback must pass the JSON as ONE escaped string literal (quotes/backslashes can't break out).
let call = SibappPurchase.callbackScript(#"{"a":"x'\"\\</script>"}"#)
let lit = call.components(separatedBy: "onPurchaseResult(")[1].dropLast()
let back = try! JSONSerialization.jsonObject(with: Data("[\(lit)]".utf8)) as! [String]
expect(back == [#"{"a":"x'\"\\</script>"}"#], "callback literal round-trips")
print("ios SibappPurchase checks: OK")
