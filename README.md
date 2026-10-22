# Arena Watch 🏆

A desktop widget that keeps an eye on AI model leaderboards for you.
Watch specific models, subscribe to whole boards, and get a native
notification the moment something moves — a new #1, a model entering or
leaving the top 10, a big score swing.

桌面小组件：盯住 AI 模型排行榜。关注指定模型、订阅整张榜，榜首易主、
进出前十、分数大变时第一时间收到系统通知。

## Features

- **Boards (订阅榜单)** — Six boards out of the box: LMArena Text / Agent /
  Search / Image-to-Video, Artificial Analysis Intelligence Index and
  AA Image-to-Video. Subscribe to a board and its top-10 churn lands in
  the event feed.
- **Watch models (关注模型)** — Search any model and pin it. Its rank on
  every watched board is tracked with a rank-history sparkline, across
  the full board (not just the top 10).
- **Event feed (变化动态)** — Leader changes, top-10 entries/exits, rank
  swaps and score jumps (threshold configurable), all in one timeline.
- **Notifications** — Native desktop notifications for the changes that
  matter; silent otherwise.
- **Widget form factor** — Lives in the tray, window is always-on-top
  (toggleable), close hides to tray, optional launch at login.
- **Snapshots & diffing** — Every refresh stores a snapshot (up to 60 per
  board); all events are computed by diffing consecutive snapshots, so
  nothing is reported from stale or guessed data.

## Data sources

| Board | Source | Notes |
| --- | --- | --- |
| LMArena (Text / Agent / Search / I2V) | Official [`lmarena-ai/leaderboard-dataset`](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) on Hugging Face (CC BY 4.0), via the datasets-server API | Sanctioned dataset; its ratings can differ slightly from the website, which uses a different snapshot |
| AA Intelligence Index | Public page at artificialanalysis.ai | Unofficial page-payload parsing; fails loudly if the page structure changes |
| AA Image-to-Video | Public page at artificialanalysis.ai | Same as above |

Arena Watch is not affiliated with LMArena or Artificial Analysis.

## Quick start

```bash
npm install
npm run dev        # launch the widget in dev mode
npm run smoke      # fetch all boards once and print the top 5 of each
npm run build      # type-check friendly production build (out/)
npm run dist       # package installers with electron-builder (release/)
```

The app icon is generated (not committed): `scripts/generate-icon.mjs`
runs automatically via npm `pre*` hooks and writes `build/icon.png` plus
`src/main/icon-data.ts`.

## How it works

```
src/main/adapters/   one adapter per data source → normalized Entry[]
src/main/store.ts    JSON store in userData: settings, subscriptions,
                     watches, snapshots, event log
src/main/diff.ts     snapshot diff → ChangeEvent[] (board-level + watch-level)
src/main/index.ts    Electron main: tray, widget window, scheduler, IPC,
                     native notifications
src/preload/         contextBridge API (window.arena)
src/renderer/        vanilla TypeScript UI: 榜单 / 关注 / 动态 / 设置
```

Adding a board = one adapter function + one entry in `BOARDS`
(`src/main/adapters/index.ts`). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- [ ] macOS code signing & notarization, Windows signing
- [ ] Auto-update via electron-updater against GitHub Releases
- [ ] More boards: SWE-bench, LiveBench, HF Open LLM Leaderboard, LMArena
      category boards (coding, vision…)
- [ ] Cross-board model aliases (the same model appears under different
      names/configs on different boards)
- [ ] Daily digest mode and webhook export of events
- [ ] Screenshots & a proper landing README once the UI settles

## License

MIT © foxmuldery. LMArena leaderboard data is © LMArena, licensed
CC BY 4.0. Artificial Analysis data belongs to its respective owner and
is read from their public pages for personal tracking.
