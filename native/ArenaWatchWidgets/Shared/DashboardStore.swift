import Foundation

/// Reads the loopback dashboard JSON and keeps the last good payload so the
/// widget still renders something when the Electron engine is not running.
final class DashboardStore {
    static let shared = DashboardStore()

    private let cacheKey = "arena-watch.cachedDashboard"

    func cached() -> Dashboard? {
        guard let data = UserDefaults.standard.data(forKey: cacheKey) else { return nil }
        return try? JSONDecoder().decode(Dashboard.self, from: data)
    }

    func load() async -> Dashboard? {
        var request = URLRequest(url: Bridge.dashboardURL)
        request.timeoutInterval = 5
        request.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                return cached()
            }
            let dashboard = try JSONDecoder().decode(Dashboard.self, from: data)
            UserDefaults.standard.set(data, forKey: cacheKey)
            return dashboard
        } catch {
            return cached()
        }
    }
}
