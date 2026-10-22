import Foundation

/// Mirrors the JSON served by Electron at http://127.0.0.1:47832/dashboard.json
/// (see src/main/dashboard.ts). Keep the two in sync.

struct Dashboard: Codable {
    let updatedAt: String?
    let appVersion: String?
    let boards: [BoardSummary]
    let watches: [WatchSummary]
    let events: [EventSummary]

    static let empty = Dashboard(updatedAt: nil, appVersion: nil, boards: [], watches: [], events: [])

    static let sample: Dashboard = {
        func entry(_ rank: Int, _ model: String, _ org: String, _ score: Double) -> LeaderboardEntry {
            LeaderboardEntry(rank: rank, model: model, org: org, score: score)
        }
        let text = BoardSummary(
            id: "lmarena-text", name: "LMArena 文本榜", nameEn: "LMArena Text",
            scoreLabel: "Elo", updatedAt: nil, entryCount: 417,
            entries: [
                entry(1, "示例模型 A", "Example", 1532.3),
                entry(2, "示例模型 B", "Example", 1516.2),
                entry(3, "示例模型 C", "Example", 1511.9),
                entry(4, "示例模型 D", "Example", 1508.6),
                entry(5, "示例模型 E", "Example", 1502.8)
            ]
        )
        let coding = BoardSummary(
            id: "lmarena-coding", name: "LMArena 编程榜", nameEn: "LMArena Coding",
            scoreLabel: "Elo", updatedAt: nil, entryCount: 390,
            entries: [entry(1, "示例模型 A", "Example", 1546.1)]
        )
        return Dashboard(
            updatedAt: nil,
            appVersion: "0.3.0",
            boards: [text, coding],
            watches: [
                WatchSummary(model: "示例模型 A", primaryBoardId: "lmarena-text", ranks: [
                    WatchRank(boardId: "lmarena-text", boardName: "LMArena 文本榜", rank: 1, score: 1532.3),
                    WatchRank(boardId: "aa-intelligence", boardName: "AA 综合智能榜", rank: 3, score: 52.6)
                ]),
                WatchSummary(model: "示例模型 B", primaryBoardId: "lmarena-text", ranks: [
                    WatchRank(boardId: "lmarena-text", boardName: "LMArena 文本榜", rank: 2, score: 1516.2)
                ])
            ],
            events: [
                EventSummary(id: "1", type: "leader_changed", text: "榜首易主：示例模型 A 登顶", boardId: "lmarena-text", boardName: "LMArena 文本榜", at: ""),
                EventSummary(id: "2", type: "entered_top10", text: "示例模型 C 升入前十：第 11 → 第 9 名", boardId: "aa-intelligence", boardName: "AA 综合智能榜", at: ""),
                EventSummary(id: "3", type: "score_jump", text: "示例模型 B 分数大变：1508.6 → 1516.2", boardId: "lmarena-text", boardName: "LMArena 文本榜", at: "")
            ]
        )
    }()
}

struct BoardSummary: Codable, Identifiable {
    let id: String
    let name: String
    let nameEn: String
    let scoreLabel: String
    let updatedAt: String?
    let entryCount: Int
    let entries: [LeaderboardEntry]
}

struct LeaderboardEntry: Codable, Identifiable {
    var id: String { "\(rank)-\(model)" }
    let rank: Int
    let model: String
    let org: String
    let score: Double
}

struct WatchSummary: Codable, Identifiable {
    var id: String { model }
    let model: String
    let primaryBoardId: String?
    let ranks: [WatchRank]
}

struct WatchRank: Codable, Identifiable {
    var id: String { boardId }
    let boardId: String
    let boardName: String
    let rank: Int
    let score: Double
}

struct EventSummary: Codable, Identifiable {
    let id: String
    let type: String
    let text: String
    let boardId: String?
    let boardName: String
    let at: String
}

// MARK: - Formatting helpers

enum ScoreFormat {
    static func string(_ value: Double) -> String {
        if value.rounded() == value { return String(Int(value)) }
        if abs(value) < 10 { return String(format: "%.2f", value) }
        return String(format: "%.1f", value)
    }
}

enum TimeFormat {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoNoFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func date(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        return iso.date(from: raw) ?? isoNoFraction.date(from: raw)
    }

    static func short(_ raw: String?) -> String {
        guard let date = date(raw) else { return "尚未刷新" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "zh_CN")
        f.dateFormat = Calendar.current.isDateInToday(date) ? "HH:mm" : "M月d日 HH:mm"
        return f.string(from: date)
    }

    static func relative(_ raw: String?) -> String {
        guard let date = date(raw) else { return "" }
        let seconds = Date().timeIntervalSince(date)
        if seconds < 60 { return "刚刚" }
        if seconds < 3600 { return "\(Int(seconds / 60)) 分钟前" }
        if seconds < 86_400 { return "\(Int(seconds / 3600)) 小时前" }
        return "\(Int(seconds / 86_400)) 天前"
    }
}
