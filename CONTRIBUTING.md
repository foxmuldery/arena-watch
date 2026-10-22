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
4. If the board writes model names in a new pattern, check that
   `canonicalModel` in `src/shared/aliases.ts` still groups it with the
   other boards; add an entry to `MANUAL_ALIASES` when the rules cannot
   infer it.

## Cross-board aliases

`src/shared/aliases.ts` reduces each board's spelling of a model to one
key (config suffixes, resolutions, `org/` prefixes and version word order
are normalised). It is deliberately conservative — when two different
models would collide, prefer adding a manual mapping over a broader rule.

## Ground rules

- Keep runtime dependencies minimal. `electron-updater` is the only one,
  because signed auto-updates against GitHub Releases are not something we
  should reimplement. Ask before adding another.
- Adapters are the only place that knows a source's wire format.
- Events are produced only by diffing stored snapshots (`src/main/diff.ts`),
  never invented inside adapters.
- UI text is Chinese-first; keep `nameEn` on boards for future i18n.
