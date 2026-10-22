# Contributing

Thanks for helping with Arena Watch. The codebase is intentionally small
and dependency-light (Electron + TypeScript, vanilla renderer).

## Dev setup

```bash
npm install
npm run dev     # hot-reload dev app
npm run smoke   # one-shot live fetch of every board (best adapter sanity check)
npm run typecheck
npm run build
```

## Adding a leaderboard

1. Write an adapter in `src/main/adapters/` that returns
   `Promise<Entry[]>` — `{ rank, model, org, score, votes? }[]`, sorted
   best-first. Fail loudly (throw) when the source shape changes; never
   return partial or stale data silently.
2. Register the board in `BOARDS` and the `fetchBoard` switch in
   `src/main/adapters/index.ts`.
3. Run `npm run smoke` and eyeball the top 5 against the source site.

## Ground rules

- No runtime dependencies unless there is a strong reason — the main
  process currently runs on Node/Electron builtins only.
- Adapters are the only place that knows a source's wire format.
- Events are produced only by diffing stored snapshots (`src/main/diff.ts`),
  never invented inside adapters.
- UI text is Chinese-first; keep `nameEn` on boards for future i18n.
