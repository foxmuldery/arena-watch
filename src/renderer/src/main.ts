import './style.css'
import type { BoardDef, ChangeEvent, Entry, Settings, Snapshot, WatchItem } from '../../shared/types'

interface BoardListItem extends BoardDef {
  subscribed: boolean
  fetchedAt: string | null
  entryCount: number
  leader: string | null
  error: string | null
}

interface WatchListItem extends WatchItem {
  current: Entry | null
  history: (number | null)[]
}

interface SnapshotPair {
  current: Snapshot | null
  previous: Snapshot | null
}

interface SearchResult {
  boardId: string
  model: string
  org: string
  rank: number
  score: number
}

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

const fmtScore = (n: number): string =>
  Number.isInteger(n) ? String(n) : Math.abs(n) < 10 ? n.toFixed(2) : n.toFixed(1)

function fmtTime(iso: string | null): string {
  if (!iso) return '尚未刷新'
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return sameDay ? `${hh}:${mm}` : `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

const state = {
  boards: [] as BoardListItem[],
  currentBoardId: 'lmarena-text',
  snapshots: new Map<string, SnapshotPair>(),
  watches: [] as WatchListItem[],
  events: [] as ChangeEvent[],
  settings: null as Settings | null,
  refreshing: false
}

const boardName = (id: string): string => state.boards.find((b) => b.id === id)?.name ?? id

/* ---------------- boards view ---------------- */

function deltaCell(model: string, pair: SnapshotPair): string {
  if (!pair.current || !pair.previous) return '<span class="muted">—</span>'
  const cur = pair.current.entries.find((e) => e.model === model)
  const prev = pair.previous.entries.find((e) => e.model === model)
  if (!cur) return '<span class="muted">—</span>'
  if (!prev) return '<span class="new-badge">NEW</span>'
  const d = prev.rank - cur.rank
  if (d > 0) return `<span class="up">▲${d}</span>`
  if (d < 0) return `<span class="down">▼${-d}</span>`
  return '<span class="muted">—</span>'
}

async function ensureSnapshot(boardId: string): Promise<SnapshotPair> {
  const cached = state.snapshots.get(boardId)
  if (cached) return cached
  const pair = (await window.arena.getSnapshot(boardId)) as SnapshotPair
  state.snapshots.set(boardId, pair)
  return pair
}

async function renderBoards(): Promise<void> {
  const view = $('#view-boards')
  const chips = state.boards
    .map(
      (b) => `<button class="chip ${b.id === state.currentBoardId ? 'active' : ''}" data-board="${b.id}">
        ${esc(b.name)}${b.subscribed ? ' <span class="star">★</span>' : ''}${b.error ? ' <span class="err-dot" title="刷新失败">●</span>' : ''}
      </button>`
    )
    .join('')
  const board = state.boards.find((b) => b.id === state.currentBoardId)
  if (!board) {
    view.innerHTML = `<div class="chips">${chips}</div><p class="empty">加载中…</p>`
    return
  }
  const pair = await ensureSnapshot(board.id)
  const top = pair.current?.entries.slice(0, 20) ?? []
  const rows = top
    .map(
      (e) => `<tr>
        <td class="rank">${e.rank}</td>
        <td class="model">${esc(e.model)}${e.org ? `<span class="org">${esc(e.org)}</span>` : ''}</td>
        <td class="score">${fmtScore(e.score)}</td>
        <td class="delta">${deltaCell(e.model, pair)}</td>
      </tr>`
    )
    .join('')
  view.innerHTML = `
    <div class="chips">${chips}</div>
    <div class="board-head">
      <div>
        <div class="board-title">${esc(board.name)} <span class="muted">${esc(board.nameEn)}</span></div>
        <div class="board-meta">更新于 ${fmtTime(board.fetchedAt)} · 共 ${board.entryCount} 个模型${board.error ? ` · <span class="err">刷新失败：${esc(board.error)}</span>` : ''}</div>
      </div>
      <div class="board-actions">
        <button id="sub-btn" class="${board.subscribed ? 'subscribed' : ''}">${board.subscribed ? '★ 已订阅' : '☆ 订阅此榜'}</button>
        <button id="source-btn" title="打开源站">源站 ↗</button>
      </div>
    </div>
    ${top.length === 0 ? '<p class="empty">暂无数据，点右上角 ⟳ 刷新</p>' : `
    <table class="board-table">
      <thead><tr><th>#</th><th>模型</th><th>${esc(board.scoreLabel)}</th><th>变化</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${board.entryCount > 20 ? '<p class="muted footnote">仅显示前 20 名，完整榜单见源站</p>' : ''}`}
  `
  view.querySelectorAll('[data-board]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.currentBoardId = (btn as HTMLElement).dataset.board as string
      void renderBoards()
    })
  })
  $('#sub-btn')?.addEventListener('click', async () => {
    await window.arena.toggleSub(board.id)
    await reloadBoardsOnly()
  })
  $('#source-btn')?.addEventListener('click', () => void window.arena.openExternal(board.url))
}

/* ---------------- watch view ---------------- */

function sparkline(history: (number | null)[]): string {
  const points = history
    .map((rank, i) => (rank === null ? null : { i, rank }))
    .filter((p): p is { i: number; rank: number } => p !== null)
  if (points.length < 2) return '<span class="muted small">趋势数据积累中</span>'
  const maxRank = Math.max(10, ...points.map((p) => p.rank))
  const W = 96
  const H = 28
  const coords = points
    .map((p) => `${((p.i / Math.max(1, history.length - 1)) * (W - 4) + 2).toFixed(1)},${(3 + ((p.rank - 1) / (maxRank - 1)) * (H - 6)).toFixed(1)}`)
    .join(' ')
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polyline points="${coords}" fill="none" stroke="#f5b942" stroke-width="1.5"/></svg>`
}

async function renderWatch(): Promise<void> {
  const view = $('#view-watch')
  const groups = new Map<string, WatchListItem[]>()
  for (const w of state.watches) {
    const list = groups.get(w.model) ?? []
    list.push(w)
    groups.set(w.model, list)
  }
  const cards = [...groups.entries()]
    .map(([model, items]) => {
      const rows = items
        .map((w) => {
          const cur = w.current
          return `<div class="watch-row">
            <span class="watch-board">${esc(boardName(w.boardId))}</span>
            <span class="watch-rank">${cur ? `第 ${cur.rank} 名 · ${fmtScore(cur.score)}` : '<span class="muted">不在榜单</span>'}</span>
            ${sparkline(w.history)}
            <button class="remove-btn" data-remove="${esc(w.id)}" title="取消关注">×</button>
          </div>`
        })
        .join('')
      return `<div class="watch-card"><div class="watch-model">${esc(model)}</div>${rows}</div>`
    })
    .join('')
  view.innerHTML = `
    <div class="search-box">
      <input id="watch-search" type="text" placeholder="搜索模型名，如 Claude / Seedance / MiniMax…" autocomplete="off" />
      <div id="search-results" class="search-results hidden"></div>
    </div>
    ${state.watches.length === 0 ? '<p class="empty">还没有关注的模型。搜一个模型名，点结果即可关注它在该榜的排名。</p>' : cards}
  `
  const input = $('#watch-search') as HTMLInputElement
  const results = $('#search-results')
  let debounce: ReturnType<typeof setTimeout> | undefined
  input.addEventListener('input', () => {
    clearTimeout(debounce)
    debounce = setTimeout(async () => {
      const q = input.value.trim()
      if (q.length < 2) {
        results.classList.add('hidden')
        results.innerHTML = ''
        return
      }
      const found = (await window.arena.searchModels(q)) as SearchResult[]
      results.innerHTML =
        found.length === 0
          ? '<div class="search-item muted">没有匹配的模型（先刷新一次榜单）</div>'
          : found
              .map(
                (r, i) => `<div class="search-item" data-idx="${i}">
                  <span>${esc(r.model)}</span>
                  <span class="muted small">${esc(boardName(r.boardId))} · 第 ${r.rank} 名</span>
                </div>`
              )
              .join('')
      results.classList.remove('hidden')
      results.querySelectorAll('[data-idx]').forEach((item) => {
        item.addEventListener('click', async () => {
          const r = found[Number((item as HTMLElement).dataset.idx)]
          await window.arena.addWatch(r.boardId, r.model)
          results.classList.add('hidden')
          input.value = ''
          await reloadWatches()
        })
      })
    }, 200)
  })
  view.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.arena.removeWatch((btn as HTMLElement).dataset.remove as string)
      await reloadWatches()
    })
  })
}

/* ---------------- events view ---------------- */

const EVENT_ICON: Record<ChangeEvent['type'], string> = {
  leader_changed: '👑',
  entered_top10: '⬆️',
  left_top10: '⬇️',
  rank_changed: '🔀',
  score_jump: '⚡',
  watch_rank: '⭐',
  watch_top10_in: '⭐⬆️',
  watch_top10_out: '⭐⬇️'
}

function renderEvents(): void {
  const view = $('#view-events')
  if (state.events.length === 0) {
    view.innerHTML = '<p class="empty">暂无变化记录。订阅榜单或关注模型后，排名变化会出现在这里。</p>'
    return
  }
  view.innerHTML = state.events
    .map(
      (e) => `<div class="event-item">
        <span class="event-icon">${EVENT_ICON[e.type] ?? '•'}</span>
        <div class="event-body">
          <div class="event-text">${esc(e.text)}</div>
          <div class="event-meta">${esc(boardName(e.boardId))} · ${fmtRelative(e.at)}</div>
        </div>
      </div>`
    )
    .join('')
}

/* ---------------- settings view ---------------- */

function renderSettings(): void {
  const view = $('#view-settings')
  const s = state.settings
  if (!s) {
    view.innerHTML = '<p class="empty">加载中…</p>'
    return
  }
  view.innerHTML = `
    <div class="setting-row">
      <label>自动刷新间隔</label>
      <select id="set-refresh">
        ${[10, 30, 60, 120].map((m) => `<option value="${m}" ${s.refreshMinutes === m ? 'selected' : ''}>${m} 分钟</option>`).join('')}
      </select>
    </div>
    <div class="setting-row">
      <label>分数变化提醒阈值</label>
      <select id="set-threshold">
        ${[3, 5, 10].map((n) => `<option value="${n}" ${s.scoreJumpThreshold === n ? 'selected' : ''}>≥ ${n} 分</option>`).join('')}
      </select>
    </div>
    <div class="setting-row"><label>窗口置顶</label><input type="checkbox" id="set-top" ${s.alwaysOnTop ? 'checked' : ''} /></div>
    <div class="setting-row"><label>变化时系统通知</label><input type="checkbox" id="set-notify" ${s.notifications ? 'checked' : ''} /></div>
    <div class="setting-row"><label>开机自启</label><input type="checkbox" id="set-login" ${s.openAtLogin ? 'checked' : ''} /></div>
    <div class="about">
      <p>数据源：LMArena 官方数据集（Hugging Face，CC BY 4.0）；Artificial Analysis 公开榜单页（非官方解析，页面结构变化时可能失效）。</p>
      <p class="muted">Arena Watch v0.1.0 · MIT License · 关闭窗口会最小化到托盘，托盘菜单可退出。</p>
    </div>
  `
  ;($('#set-refresh') as HTMLSelectElement).addEventListener('change', async (e) => {
    state.settings = await window.arena.setSettings({ refreshMinutes: Number((e.target as HTMLSelectElement).value) })
  })
  ;($('#set-threshold') as HTMLSelectElement).addEventListener('change', async (e) => {
    state.settings = await window.arena.setSettings({ scoreJumpThreshold: Number((e.target as HTMLSelectElement).value) })
  })
  ;($('#set-top') as HTMLInputElement).addEventListener('change', async (e) => {
    state.settings = await window.arena.setSettings({ alwaysOnTop: (e.target as HTMLInputElement).checked })
  })
  ;($('#set-notify') as HTMLInputElement).addEventListener('change', async (e) => {
    state.settings = await window.arena.setSettings({ notifications: (e.target as HTMLInputElement).checked })
  })
  ;($('#set-login') as HTMLInputElement).addEventListener('change', async (e) => {
    state.settings = await window.arena.setSettings({ openAtLogin: (e.target as HTMLInputElement).checked })
  })
}

/* ---------------- shell / data loading ---------------- */

async function reloadBoardsOnly(): Promise<void> {
  state.boards = (await window.arena.listBoards()) as BoardListItem[]
  state.snapshots.clear()
  await renderBoards()
}

async function reloadWatches(): Promise<void> {
  state.watches = (await window.arena.listWatches()) as WatchListItem[]
  await renderWatch()
}

async function reloadAll(): Promise<void> {
  state.boards = (await window.arena.listBoards()) as BoardListItem[]
  state.snapshots.clear()
  state.watches = (await window.arena.listWatches()) as WatchListItem[]
  state.events = (await window.arena.listEvents(100)) as ChangeEvent[]
  await renderBoards()
  await renderWatch()
  renderEvents()
}

function setRefreshing(on: boolean): void {
  state.refreshing = on
  const btn = $('#refresh-btn') as HTMLButtonElement
  btn.classList.toggle('spinning', on)
  btn.disabled = on
  $('#status').textContent = on ? '刷新中…' : ''
}

async function init(): Promise<void> {
  document.querySelectorAll('#tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tabs button').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      const tab = (btn as HTMLElement).dataset.tab as string
      for (const name of ['boards', 'watch', 'events', 'settings']) {
        $(`#view-${name}`).classList.toggle('hidden', name !== tab)
      }
    })
  })
  $('#refresh-btn').addEventListener('click', async () => {
    setRefreshing(true)
    await window.arena.refresh()
    setRefreshing(false)
    await reloadAll()
  })
  state.settings = await window.arena.getSettings()
  renderSettings()
  await reloadAll()
  window.arena.onUpdated(() => void reloadAll())
  window.arena.onRefreshing((on) => setRefreshing(on))
}

void init()
