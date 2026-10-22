import type { BoardDef, Entry } from '../../shared/types'
import { fetchLmArenaBoard } from './lmarena'
import { fetchAaImageToVideo, fetchAaIntelligence } from './aa'

export const BOARDS: BoardDef[] = [
  {
    id: 'lmarena-text',
    name: 'LMArena 文本榜',
    nameEn: 'LMArena Text',
    source: 'lmarena',
    scoreLabel: 'Elo',
    url: 'https://lmarena.ai/leaderboard/text'
  },
  {
    id: 'lmarena-agent',
    name: 'LMArena Agent 榜',
    nameEn: 'LMArena Agent',
    source: 'lmarena',
    scoreLabel: 'Score',
    url: 'https://lmarena.ai/leaderboard/agent'
  },
  {
    id: 'lmarena-search',
    name: 'LMArena 搜索榜',
    nameEn: 'LMArena Search',
    source: 'lmarena',
    scoreLabel: 'Elo',
    url: 'https://lmarena.ai/leaderboard/search'
  },
  {
    id: 'lmarena-i2v',
    name: 'LMArena 图生视频榜',
    nameEn: 'LMArena Image-to-Video',
    source: 'lmarena',
    scoreLabel: 'Elo',
    url: 'https://lmarena.ai/leaderboard/image-to-video'
  },
  {
    id: 'aa-intelligence',
    name: 'AA 综合智能榜',
    nameEn: 'AA Intelligence Index',
    source: 'artificial-analysis',
    scoreLabel: 'Index',
    url: 'https://artificialanalysis.ai/leaderboards/models'
  },
  {
    id: 'aa-i2v',
    name: 'AA 图生视频榜',
    nameEn: 'AA Video I2V',
    source: 'artificial-analysis',
    scoreLabel: 'Elo',
    url: 'https://artificialanalysis.ai/video/leaderboard/image-to-video'
  }
]

export function getBoardDef(boardId: string): BoardDef {
  const def = BOARDS.find((b) => b.id === boardId)
  if (!def) throw new Error(`Unknown board: ${boardId}`)
  return def
}

export async function fetchBoard(boardId: string): Promise<Entry[]> {
  switch (boardId) {
    case 'lmarena-text':
      return fetchLmArenaBoard('text')
    case 'lmarena-agent':
      return fetchLmArenaBoard('agent')
    case 'lmarena-search':
      return fetchLmArenaBoard('search')
    case 'lmarena-i2v':
      return fetchLmArenaBoard('image_to_video')
    case 'aa-intelligence':
      return fetchAaIntelligence()
    case 'aa-i2v':
      return fetchAaImageToVideo()
    default:
      throw new Error(`Unknown board: ${boardId}`)
  }
}
