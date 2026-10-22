import type { BoardDef, Entry } from '../../shared/types'
import { fetchLmArenaBoard } from './lmarena'
import { fetchAaImageToVideo, fetchAaIntelligence } from './aa'
import { fetchSweBenchVerified } from './swebench'
import { fetchLiveBench } from './livebench'
import { fetchHfOpenLlm } from './hf'

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
    id: 'lmarena-coding',
    name: 'LMArena 编程榜',
    nameEn: 'LMArena Coding',
    source: 'lmarena',
    scoreLabel: 'Elo',
    url: 'https://lmarena.ai/leaderboard/text?category=coding',
    note: '文本榜 coding 分类，与其他分类分开排名'
  },
  {
    id: 'lmarena-chinese',
    name: 'LMArena 中文榜',
    nameEn: 'LMArena Chinese',
    source: 'lmarena',
    scoreLabel: 'Elo',
    url: 'https://lmarena.ai/leaderboard/text?category=chinese',
    note: '文本榜 chinese 分类，与其他分类分开排名'
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
  },
  {
    id: 'swebench-verified',
    name: 'SWE-bench Verified',
    nameEn: 'SWE-bench Verified',
    source: 'swe-bench',
    scoreLabel: 'Resolved %',
    url: 'https://www.swebench.com/',
    note: '每个模型取最佳 Agent 配置成绩'
  },
  {
    id: 'livebench',
    name: 'LiveBench 综合榜',
    nameEn: 'LiveBench',
    source: 'livebench',
    scoreLabel: 'Score',
    url: 'https://livebench.ai/',
    note: '各分类平均分（0–100）'
  },
  {
    id: 'hf-open-llm',
    name: 'HF 开源模型榜',
    nameEn: 'HF Open LLM',
    source: 'huggingface',
    scoreLabel: 'Avg',
    url: 'https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard',
    note: '已归档的开源权重榜，仅收录前 500 名'
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
    case 'lmarena-coding':
      return fetchLmArenaBoard('text', 'coding')
    case 'lmarena-chinese':
      return fetchLmArenaBoard('text', 'chinese')
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
    case 'swebench-verified':
      return fetchSweBenchVerified()
    case 'livebench':
      return fetchLiveBench()
    case 'hf-open-llm':
      return fetchHfOpenLlm()
    default:
      throw new Error(`Unknown board: ${boardId}`)
  }
}
