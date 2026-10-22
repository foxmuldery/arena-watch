import type { ChangeEvent, Entry, Settings } from '../shared/types'

function evt(
  boardId: string,
  type: ChangeEvent['type'],
  model: string,
  text: string,
  extra: Partial<ChangeEvent> = {}
): ChangeEvent {
  return {
    id: `${boardId}:${type}:${model}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    boardId,
    type,
    model,
    at: new Date().toISOString(),
    text,
    ...extra
  }
}

const fmtScore = (n: number): string =>
  Number.isInteger(n) ? String(n) : Math.abs(n) < 10 ? n.toFixed(2) : n.toFixed(1)

/**
 * Board-level diff: leader changes, top-10 entries/exits, rank swaps inside
 * the top 10, and large score moves. Deliberately ignores movement below
 * rank 10 to keep the event feed signal-dense.
 */
export function diffBoard(
  boardId: string,
  prev: Entry[],
  curr: Entry[],
  settings: Settings
): ChangeEvent[] {
  const events: ChangeEvent[] = []
  const prevByModel = new Map(prev.map((e) => [e.model, e]))
  const currByModel = new Map(curr.map((e) => [e.model, e]))
  const prevTop10 = prev.filter((e) => e.rank <= 10)
  const currTop10 = curr.filter((e) => e.rank <= 10)

  const prevLeader = prev[0]
  const currLeader = curr[0]
  if (prevLeader && currLeader && prevLeader.model !== currLeader.model) {
    events.push(
      evt(boardId, 'leader_changed', currLeader.model, `榜首易主：${currLeader.model} 登顶（${fmtScore(currLeader.score)}），取代 ${prevLeader.model}`, {
        from: 2,
        to: 1,
        scoreFrom: prevLeader.score,
        scoreTo: currLeader.score
      })
    )
  }

  for (const e of currTop10) {
    const p = prevByModel.get(e.model)
    if (!p) {
      events.push(evt(boardId, 'entered_top10', e.model, `${e.model} 新进前十，现第 ${e.rank} 名`, { to: e.rank, scoreTo: e.score }))
    } else if (p.rank > 10) {
      events.push(
        evt(boardId, 'entered_top10', e.model, `${e.model} 升入前十：第 ${p.rank} → 第 ${e.rank} 名`, { from: p.rank, to: e.rank, scoreFrom: p.score, scoreTo: e.score })
      )
    } else if (p.rank !== e.rank && !(prevLeader && currLeader && e.model === currLeader.model && prevLeader.model !== currLeader.model)) {
      events.push(
        evt(boardId, 'rank_changed', e.model, `${e.model} 名次变动：第 ${p.rank} → 第 ${e.rank} 名`, { from: p.rank, to: e.rank, scoreFrom: p.score, scoreTo: e.score })
      )
    }
    if (p && Math.abs(e.score - p.score) >= settings.scoreJumpThreshold && p.rank <= 10) {
      events.push(
        evt(boardId, 'score_jump', e.model, `${e.model} 分数大变：${fmtScore(p.score)} → ${fmtScore(e.score)}`, { from: p.rank, to: e.rank, scoreFrom: p.score, scoreTo: e.score })
      )
    }
  }

  for (const e of prevTop10) {
    const c = currByModel.get(e.model)
    if (!c) {
      events.push(evt(boardId, 'left_top10', e.model, `${e.model} 跌出前十（原第 ${e.rank} 名，已不在榜单）`, { from: e.rank, scoreFrom: e.score }))
    } else if (c.rank > 10) {
      events.push(
        evt(boardId, 'left_top10', e.model, `${e.model} 跌出前十：第 ${e.rank} → 第 ${c.rank} 名`, { from: e.rank, to: c.rank, scoreFrom: e.score, scoreTo: c.score })
      )
    }
  }
  return events
}

/** Watched-model diff: any rank change, plus top-10 boundary crossings. */
export function diffWatch(boardId: string, model: string, prev: Entry[], curr: Entry[]): ChangeEvent[] {
  const events: ChangeEvent[] = []
  const p = prev.find((e) => e.model === model)
  const c = curr.find((e) => e.model === model)
  if (!p && !c) return events
  if (!p && c) {
    events.push(evt(boardId, 'watch_rank', model, `关注的 ${model} 出现在榜单：第 ${c.rank} 名`, { to: c.rank, scoreTo: c.score }))
    return events
  }
  if (p && !c) {
    events.push(evt(boardId, 'watch_rank', model, `关注的 ${model} 已不在榜单（原第 ${p.rank} 名）`, { from: p.rank, scoreFrom: p.score }))
    return events
  }
  if (!p || !c) return events
  if (p.rank <= 10 && c.rank > 10) {
    events.push(evt(boardId, 'watch_top10_out', model, `关注的 ${model} 跌出前十：第 ${p.rank} → 第 ${c.rank} 名`, { from: p.rank, to: c.rank, scoreFrom: p.score, scoreTo: c.score }))
  } else if (p.rank > 10 && c.rank <= 10) {
    events.push(evt(boardId, 'watch_top10_in', model, `关注的 ${model} 升入前十：第 ${p.rank} → 第 ${c.rank} 名`, { from: p.rank, to: c.rank, scoreFrom: p.score, scoreTo: c.score }))
  } else if (p.rank !== c.rank) {
    events.push(
      evt(boardId, 'watch_rank', model, `关注的 ${model} 名次变动：第 ${p.rank} → 第 ${c.rank} 名（${fmtScore(p.score)} → ${fmtScore(c.score)}）`, { from: p.rank, to: c.rank, scoreFrom: p.score, scoreTo: c.score })
    )
  }
  return events
}
