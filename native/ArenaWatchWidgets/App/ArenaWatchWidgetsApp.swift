import SwiftUI
import AppKit

@main
struct ArenaWatchWidgetsApp: App {
    var body: some Scene {
        WindowGroup {
            HostView()
        }
        .windowResizability(.contentSize)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }
    }
}

struct HostView: View {
    @State private var dashboard: Dashboard?
    @State private var loading = false

    private let gold = Palette.gold

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(gold)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Arena Watch 桌面小组件")
                        .font(.system(size: 18, weight: .bold))
                    Text("WidgetKit 宿主 · 数据来自 Arena Watch 托盘应用")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                Label("怎么用", systemImage: "1.circle.fill")
                    .font(.system(size: 12, weight: .semibold))
                Text("① 先启动 Arena Watch 托盘应用并刷新一次数据\n② 右键桌面 →「编辑小组件」，或打开通知中心 →「编辑小组件」\n③ 搜索 Arena Watch，添加「仪表台 / 榜单 / 关注模型 / 变化动态」")
                    .font(.system(size: 11.5))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("数据状态")
                            .font(.system(size: 12, weight: .semibold))
                        Spacer()
                        if loading {
                            ProgressView().controlSize(.small)
                        } else {
                            Text(dashboard?.updatedAt == nil ? "未连接" : "已连接")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(dashboard?.updatedAt == nil ? .secondary : Palette.up)
                        }
                    }
                    if let dashboard, let updatedAt = dashboard.updatedAt {
                        Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 4) {
                            GridRow {
                                stat("榜单", "\(dashboard.boards.count)")
                                stat("关注", "\(dashboard.watches.count)")
                                stat("动态", "\(dashboard.events.count)")
                            }
                        }
                        Text("最近更新：\(TimeFormat.short(updatedAt))")
                            .font(.system(size: 10.5))
                            .foregroundStyle(.secondary)
                    } else {
                        Text("还没有收到数据。请确认 Arena Watch 正在运行（托盘里应有图标）。")
                            .font(.system(size: 10.5))
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(4)
            }

            HStack(spacing: 10) {
                Button("打开 Arena Watch") { openEngine() }
                    .keyboardShortcut(.defaultAction)
                Button("刷新状态") { Task { await refresh() } }
                    .disabled(loading)
                Spacer()
            }

            Text("小组件由系统按时间线刷新（约 15–30 分钟一次），不是实时面板。")
                .font(.system(size: 10))
                .foregroundStyle(.tertiary)
        }
        .padding(22)
        .frame(width: 460)
        .task { await refresh() }
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value).font(.system(size: 15, weight: .semibold, design: .rounded))
            Text(title).font(.system(size: 9.5)).foregroundStyle(.secondary)
        }
    }

    private func refresh() async {
        loading = true
        dashboard = await DashboardStore.shared.load()
        if dashboard == nil { dashboard = DashboardStore.shared.cached() }
        loading = false
    }

    private func openEngine() {
        guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "app.arenawatch") else {
            return
        }
        NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
    }
}
