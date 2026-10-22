import SwiftUI
import WidgetKit

struct DashboardEntry: TimelineEntry {
    let date: Date
    let dashboard: Dashboard
}

struct DashboardProvider: TimelineProvider {
    func placeholder(in context: Context) -> DashboardEntry {
        DashboardEntry(date: Date(), dashboard: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (DashboardEntry) -> Void) {
        // The widget gallery must render instantly; don't wait on the bridge.
        if context.isPreview {
            completion(DashboardEntry(date: Date(), dashboard: DashboardStore.shared.cached() ?? .sample))
            return
        }
        Task {
            let dashboard = await DashboardStore.shared.load() ?? DashboardStore.shared.cached() ?? .sample
            completion(DashboardEntry(date: Date(), dashboard: dashboard))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DashboardEntry>) -> Void) {
        Task {
            let dashboard = await DashboardStore.shared.load() ?? DashboardStore.shared.cached() ?? .sample
            let entry = DashboardEntry(date: Date(), dashboard: dashboard)
            // WidgetKit decides the real refresh moment. Retry sooner while
            // there is no data yet (engine still starting or first refresh).
            let minutes = dashboard.boards.isEmpty ? 5 : 30
            let next = Calendar.current.date(byAdding: .minute, value: minutes, to: Date())
                ?? Date().addingTimeInterval(Double(minutes) * 60)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

struct ArenaLeaderboardWidget: Widget {
    let kind = "ArenaLeaderboardWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DashboardProvider()) { entry in
            LeaderboardCard(
                board: entry.dashboard.boards.first(where: { $0.id == "lmarena-text" })
                    ?? entry.dashboard.boards.first
            )
        }
        .configurationDisplayName("榜单")
        .description("一张榜单的前五名与更新时间。")
        .supportedFamilies([.systemMedium])
        .contentMarginsDisabled()
    }
}

struct ArenaWatchlistWidget: Widget {
    let kind = "ArenaWatchlistWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DashboardProvider()) { entry in
            WatchlistCard(watches: entry.dashboard.watches)
        }
        .configurationDisplayName("关注模型")
        .description("关注的模型在各张榜单上的排名。")
        .supportedFamilies([.systemMedium])
        .contentMarginsDisabled()
    }
}

struct ArenaEventsWidget: Widget {
    let kind = "ArenaEventsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DashboardProvider()) { entry in
            EventsCard(events: entry.dashboard.events)
        }
        .configurationDisplayName("变化动态")
        .description("榜首易主、前十进出、分数大变等最新动态。")
        .supportedFamilies([.systemMedium])
        .contentMarginsDisabled()
    }
}

struct ArenaDashboardWidget: Widget {
    let kind = "ArenaDashboardWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DashboardProvider()) { entry in
            DashboardCard(dashboard: entry.dashboard)
        }
        .configurationDisplayName("仪表台")
        .description("各榜榜首、关注模型和最新动态合在一张大卡片里。")
        .supportedFamilies([.systemLarge])
        .contentMarginsDisabled()
    }
}

@main
struct ArenaWatchWidgetBundle: WidgetBundle {
    var body: some Widget {
        ArenaDashboardWidget()
        ArenaLeaderboardWidget()
        ArenaWatchlistWidget()
        ArenaEventsWidget()
    }
}
