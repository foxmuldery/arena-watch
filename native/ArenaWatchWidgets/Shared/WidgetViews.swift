import SwiftUI
import WidgetKit

// MARK: - Palette

enum Palette {
    static let backgroundTop = Color(red: 0.062, green: 0.075, blue: 0.102)
    static let backgroundBottom = Color(red: 0.094, green: 0.114, blue: 0.153)
    static let gold = Color(red: 0.961, green: 0.725, blue: 0.259)
    static let text = Color.white.opacity(0.95)
    static let muted = Color.white.opacity(0.55)
    static let faint = Color.white.opacity(0.38)
    static let border = Color.white.opacity(0.08)
    static let up = Color(red: 0.247, green: 0.725, blue: 0.439)
    static let down = Color(red: 0.898, green: 0.325, blue: 0.294)
}

// MARK: - Shared chrome

struct WidgetSurface<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .containerBackground(for: .widget) {
                LinearGradient(
                    colors: [Palette.backgroundTop, Palette.backgroundBottom],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
    }
}

struct WidgetHeader: View {
    let title: String
    var subtitle: String?
    var systemImage: String = "trophy.fill"

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Palette.gold)
            Text(title)
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundStyle(Palette.text)
                .lineLimit(1)
            Spacer(minLength: 4)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: 9.5))
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
            }
        }
    }
}

struct SectionLabel: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 9, weight: .semibold))
            .tracking(0.8)
            .foregroundStyle(Palette.faint)
    }
}

// MARK: - Rows

struct LeaderboardRow: View {
    let entry: LeaderboardEntry
    var showOrg: Bool = false

    var body: some View {
        HStack(spacing: 8) {
            Text("\(entry.rank)")
                .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                .foregroundStyle(entry.rank <= 3 ? Palette.gold : Palette.muted)
                .frame(width: 15, alignment: .leading)
            VStack(alignment: .leading, spacing: 0) {
                Text(entry.model)
                    .font(.system(size: 11.5, weight: entry.rank == 1 ? .semibold : .regular))
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                if showOrg, !entry.org.isEmpty {
                    Text(entry.org)
                        .font(.system(size: 8.5))
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            Text(ScoreFormat.string(entry.score))
                .font(.system(size: 10.5, design: .monospaced))
                .foregroundStyle(Palette.muted)
        }
    }
}

// MARK: - Cards

struct LeaderboardCard: View {
    let board: BoardSummary?
    var limit: Int = 5

    var body: some View {
        WidgetSurface {
            VStack(alignment: .leading, spacing: 7) {
                if let board {
                    WidgetHeader(
                        title: board.name,
                        subtitle: "更新于 \(TimeFormat.short(board.updatedAt))",
                        systemImage: "chart.bar.fill"
                    )
                    ForEach(Array(board.entries.prefix(limit))) { entry in
                        LeaderboardRow(entry: entry, showOrg: limit <= 4)
                    }
                } else {
                    WidgetHeader(title: "榜单", subtitle: nil, systemImage: "chart.bar.fill")
                    EmptyMessage(text: "等待数据…请先启动 Arena Watch")
                }
                Spacer(minLength: 0)
            }
        }
    }
}

struct WatchlistCard: View {
    let watches: [WatchSummary]
    var limit: Int = 3

    var body: some View {
        WidgetSurface {
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(
                    title: "关注模型",
                    subtitle: watches.isEmpty ? nil : "覆盖 \(boardCount) 张榜",
                    systemImage: "star.fill"
                )
                if watches.isEmpty {
                    EmptyMessage(text: "还没有关注模型")
                } else {
                    ForEach(Array(watches.prefix(limit))) { watch in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(watch.model)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(Palette.text)
                                .lineLimit(1)
                            HStack(spacing: 6) {
                                ForEach(Array(watch.ranks.prefix(3))) { rank in
                                    Text("\(BoardShort.name(rank.boardId, rank.boardName)) #\(rank.rank)")
                                        .font(.system(size: 9, weight: .medium, design: .rounded))
                                        .foregroundStyle(Palette.muted)
                                        .padding(.horizontal, 5)
                                        .padding(.vertical, 1.5)
                                        .background(Palette.border, in: Capsule())
                                }
                                if watch.ranks.count > 3 {
                                    Text("+\(watch.ranks.count - 3)")
                                        .font(.system(size: 9, weight: .medium, design: .rounded))
                                        .foregroundStyle(Palette.faint)
                                }
                            }
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var boardCount: Int {
        Set(watches.flatMap { $0.ranks.map(\.boardId) }).count
    }
}

struct EventsCard: View {
    let events: [EventSummary]
    var limit: Int = 3

    private func meta(_ event: EventSummary) -> String {
        let parts = [BoardShort.name(event.boardId ?? "", event.boardName), TimeFormat.relative(event.at)]
            .filter { !$0.isEmpty }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        WidgetSurface {
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(
                    title: "变化动态",
                    subtitle: events.isEmpty ? nil : "最新 \(min(limit, events.count)) 条",
                    systemImage: "bolt.fill"
                )
                if events.isEmpty {
                    EmptyMessage(text: "暂无变化，等下一次刷新")
                } else {
                    ForEach(Array(events.prefix(limit))) { event in
                        HStack(alignment: .top, spacing: 6) {
                            Text(EventIcon.symbol(event.type))
                                .font(.system(size: 10))
                                .frame(width: 14)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(EventText.compact(event.text))
                                    .font(.system(size: 10.5))
                                    .foregroundStyle(Palette.text)
                                    .lineLimit(2)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text(meta(event))
                                    .font(.system(size: 8.5))
                                    .foregroundStyle(Palette.muted)
                                    .lineLimit(1)
                            }
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

/// The "dashboard" card: one leader per board, watched models, latest events.
struct DashboardCard: View {
    let dashboard: Dashboard
    var boardLimit: Int = 6
    var watchLimit: Int = 3
    var eventLimit: Int = 3

    var body: some View {
        WidgetSurface {
            VStack(alignment: .leading, spacing: 9) {
                WidgetHeader(
                    title: "Arena Watch",
                    subtitle: "更新于 \(TimeFormat.short(dashboard.updatedAt))",
                    systemImage: "trophy.fill"
                )

                if dashboard.boards.isEmpty {
                    EmptyMessage(text: "等待数据…请先启动 Arena Watch 并刷新")
                    Spacer(minLength: 0)
                } else {
                    SectionLabel(text: "各榜榜首")
                    VStack(spacing: 4) {
                        ForEach(Array(dashboard.boards.prefix(boardLimit))) { board in
                            HStack(spacing: 6) {
                                Text(BoardShort.name(board.id, board.name))
                                    .font(.system(size: 9.5, weight: .medium))
                                    .foregroundStyle(Palette.muted)
                                    .frame(width: 62, alignment: .leading)
                                    .lineLimit(1)
                                Text(board.entries.first?.model ?? "—")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(Palette.text)
                                    .lineLimit(1)
                                Spacer(minLength: 4)
                                Text(board.entries.first.map { ScoreFormat.string($0.score) } ?? "")
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundStyle(Palette.faint)
                            }
                        }
                    }

                    if !dashboard.watches.isEmpty {
                        Divider().overlay(Palette.border)
                        SectionLabel(text: "关注")
                        VStack(spacing: 4) {
                            ForEach(Array(dashboard.watches.prefix(watchLimit))) { watch in
                                HStack(spacing: 6) {
                                    Text(watch.model)
                                        .font(.system(size: 10.5))
                                        .foregroundStyle(Palette.text)
                                        .lineLimit(1)
                                    Spacer(minLength: 4)
                                    if let primary = watch.ranks.first(where: { $0.boardId == watch.primaryBoardId })
                                        ?? watch.ranks.min(by: { $0.rank < $1.rank }) {
                                        Text("\(BoardShort.name(primary.boardId, primary.boardName)) #\(primary.rank)")
                                            .font(.system(size: 9.5, weight: .medium, design: .rounded))
                                            .foregroundStyle(Palette.gold)
                                    }
                                }
                            }
                        }
                    }

                    if !dashboard.events.isEmpty {
                        Divider().overlay(Palette.border)
                        SectionLabel(text: "动态")
                        VStack(alignment: .leading, spacing: 5) {
                            ForEach(Array(dashboard.events.prefix(eventLimit))) { event in
                                HStack(alignment: .top, spacing: 5) {
                                    Text(EventIcon.symbol(event.type)).font(.system(size: 9))
                                    Text(EventText.compact(event.text))
                                        .font(.system(size: 10))
                                        .foregroundStyle(Palette.text)
                                        .lineLimit(1)
                                }
                            }
                        }
                    }
                    Spacer(minLength: 2)
                    HStack(spacing: 4) {
                        Text("\(dashboard.boards.count) 张榜 · \(dashboard.watches.count) 个关注")
                        Spacer(minLength: 4)
                        Text("约 30 分钟刷新")
                    }
                    .font(.system(size: 8.5))
                    .foregroundStyle(Palette.faint)
                }
            }
        }
    }
}

struct EmptyMessage: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 10.5))
            .foregroundStyle(Palette.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 4)
    }
}

// MARK: - Labels

enum BoardShort {
    static func name(_ id: String, _ fallback: String) -> String {
        switch id {
        case "lmarena-text": return "文本"
        case "lmarena-coding": return "编程"
        case "lmarena-chinese": return "中文"
        case "lmarena-agent": return "Agent"
        case "lmarena-search": return "搜索"
        case "lmarena-i2v": return "图生视频"
        case "aa-intelligence": return "AA 智能"
        case "aa-i2v": return "AA 视频"
        case "swebench-verified": return "SWE-bench"
        case "livebench": return "LiveBench"
        case "hf-open-llm": return "HF"
        default:
            return fallback
                .replacingOccurrences(of: "LMArena ", with: "")
                .replacingOccurrences(of: " 榜", with: "")
        }
    }
}

enum EventText {
    /// Widgets are narrow; drop "(max with fallback)"-style config suffixes
    /// so the actual change stays readable.
    static func compact(_ text: String) -> String {
        text
            .replacingOccurrences(of: #"\([^)]*\)"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: "  ", with: " ")
            .trimmingCharacters(in: .whitespaces)
    }
}

enum EventIcon {
    static func symbol(_ type: String) -> String {
        switch type {
        case "leader_changed": return "👑"
        case "entered_top10": return "⬆️"
        case "left_top10": return "⬇️"
        case "rank_changed": return "🔀"
        case "score_jump": return "⚡"
        case "watch_rank": return "⭐"
        case "watch_top10_in": return "⭐⬆️"
        case "watch_top10_out": return "⭐⬇️"
        default: return "•"
        }
    }
}
