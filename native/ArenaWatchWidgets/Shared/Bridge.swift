import Foundation

enum Bridge {
    /// Must match BRIDGE_PORT in src/main/dashboard.ts.
    static let port = 47832
    static var dashboardURL: URL {
        URL(string: "http://127.0.0.1:\(port)/dashboard.json")!
    }
}
