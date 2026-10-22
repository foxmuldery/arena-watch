# macOS 桌面小组件（WidgetKit）

Arena Watch 现在提供 **原生 WidgetKit 桌面小组件**，不是 Electron 窗口里的网页。
小组件可以放在桌面或通知中心，共四张：

| 小组件 | 尺寸 | 内容 |
| --- | --- | --- |
| 仪表台 | 大 | 各榜榜首 + 关注模型 + 最新动态 |
| 榜单 | 中 | 一张榜单的前五名与更新时间 |
| 关注模型 | 中 | 每个模型在各榜的排名（含 +N） |
| 变化动态 | 中 | 最新 3 条变化事件 |

预览图见 `docs/screenshots/widget-*.png`（用真实榜单数据渲染）。

## 架构

```
Arena Watch.app (Electron)
  ├─ 取数 / 快照 / diff / 通知 / 托盘
  ├─ 本地 JSON 存储
  └─ HTTP 127.0.0.1:47832/dashboard.json   ← 只读、仅本机
                 ▲
                 │ URLSession
Arena Watch Widgets.app (SwiftUI 宿主)
  └─ Contents/PlugIns/ArenaWatchWidgetExtension.appex
        └─ 四张 WidgetKit 卡片，按时间线刷新
```

为什么用本机 HTTP 而不是共享文件：

- WidgetKit 扩展运行在沙盒里，读不到 Electron 的 `userData` 目录；
- App Group 需要额外的 Provisioning Profile 与 entitlement，公开分发时签名链更复杂；
- 本机回环接口零依赖，Electron 不在时小组件回退到上一次缓存。

接口只绑定 `127.0.0.1`，只返回榜单、关注、事件数据，不含设置或凭据。
Electron 退出后小组件继续显示最后一次成功获取的数据。

## 安装

正式分发包里会有两个 App：

1. `Arena Watch.app`（Electron 托盘应用，负责取数）；
2. `Arena Watch Widgets.app`（小组件宿主，必须先运行一次完成注册）。

把两个都拖进「应用程序」，然后：

1. 启动 **Arena Watch**，等它完成一次刷新（托盘里能看到图标）；
2. 启动一次 **Arena Watch Widgets**，确认窗口里显示「已连接」和榜单数量；
3. 右键桌面 →「编辑小组件」，或打开通知中心 →「编辑小组件」；
4. 搜索 **Arena Watch**，添加「仪表台 / 榜单 / 关注模型 / 变化动态」。

> 小组件由系统按时间线刷新（通常 15–30 分钟一次），不是实时面板。
> 想要立即看到新数据，先在 Arena Watch 里手动刷新，再等系统下一次刷新小组件。

## 本机试跑

```bash
# 1. 启动带数据桥的 Electron（保持运行）
npm run dev

# 2. 构建并安装小组件宿主（会复制到 ~/Applications 并启动）
cd native && ./install.sh
```

宿主窗口应显示「已连接」以及榜单/关注/动态数量。随后按上面的步骤添加小组件。
如果只是开发调试，宿主放在 `native/dist` 也可以；正式使用时请放到
`/Applications`，否则系统可能不会在小组件库里列出它。

## 构建（本机）

需要 Xcode 26+ 与 [XcodeGen](https://github.com/yonaskolb/XcodeGen)：

```bash
# 任选其一放置 xcodegen
#   brew install xcodegen
#   或把 release 包解压到 ../tools/xcodegen/bin/xcodegen
cd native
./build.sh                 # 本地临时签名（ad-hoc）
```

产物：`native/dist/Arena Watch Widgets.app`。

发布签名：

```bash
SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" ./build.sh
```

脚本会先签 `.appex`，再签宿主 App，并校验 `codesign --verify --deep --strict`。

## 签名与分发要求

WidgetKit 扩展必须由**有效的开发者签名**才能被系统接受：

- 本机自测：Xcode 的本地签名通常可用，但 ad-hoc 签名不保证出现在小组件库；
- 公开分发：需要 **Developer ID Application** 证书（与 Electron 应用同一 Team），
  并对两个 App 一起公证。App Group 未使用，所以不需要额外 profile。

具体证书材料与 CI Secrets 见 [signing.md](signing.md)。在拿到 Developer ID 前，
正式 Release 不会附带小组件宿主包，避免发布一个别人装不上的 App。

## 端口与故障排查

- 固定端口：`47832`（`src/main/dashboard.ts` 与 `native/ArenaWatchWidgets/Shared/Bridge.swift` 必须一致）。
- 小组件显示「等待数据…」：
  1. 确认 Arena Watch 正在运行；
  2. 终端执行 `curl http://127.0.0.1:47832/dashboard.json` 应返回 JSON；
  3. 端口被占用时 Electron 日志会打印 `dashboard bridge failed`，关闭占用进程后重启。
- 小组件列表里搜不到 Arena Watch：
  1. 确认 `Arena Watch Widgets.app` 在 `/Applications`；
  2. 启动一次宿主 App；
  3. 若仍不出现，通常是签名问题（见上一节）。
- 小组件数据不更新：系统会节流刷新；先在 Electron 里刷新，再等待系统时间线。
