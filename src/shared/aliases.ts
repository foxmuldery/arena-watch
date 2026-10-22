/**
 * Cross-board model aliasing.
 *
 * The same model is written differently on each board:
 *   LMArena   "Claude Opus 5.5 (High)"
 *   AA        "Claude Opus 5.5 (high with fallback)"
 *   LiveBench "claude-opus-5.5"
 *   SWE-bench "Claude 4.5 Opus"
 *
 * `canonicalModel` reduces all of them to a comparable key: drop config
 * parentheses and resolutions, remove the HF "org/" prefix, normalize
 * punctuation/version separators, and reorder the few vendor patterns that
 * put the version before the family name. The table at the bottom is the
 * explicit escape hatch for names the rules cannot infer.
 */

const MANUAL_ALIASES: Record<string, string> = {
  // SWE-bench's "Claude 4.5 Opus" and everyone else's "Claude Opus 4.5"
  'claude 4 5 opus': 'claude opus 4 5',
  'claude 4 opus': 'claude opus 4',
  'claude 4 sonnet': 'claude sonnet 4',
  'claude 4 1 opus': 'claude opus 4 1',
  'claude 4 1 sonnet': 'claude sonnet 4 1',
  // AA lists "Gemini Omni Flash 1.1", LMArena lists "gemini-omni-1.1-flash"
  'gemini omni 1 1 flash': 'gemini omni flash 1 1',
  'gemini omni 1 flash': 'gemini omni flash 1'
}

function reorder(s: string): string {
  // "claude 4.5 opus" -> "claude opus 4.5"
  const claude = /^claude (\d+(?: \d+)*) (opus|sonnet|haiku)$/.exec(s)
  if (claude) return `claude ${claude[2]} ${claude[1]}`
  return s
}

export function canonicalModel(raw: string): string {
  let s = raw.normalize('NFKC').toLowerCase()
  // Config suffixes: "(High)", "(max with fallback)", "[thinking]", resolutions.
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ')
  // Hugging Face names are "org/model"; the board identity is the model part.
  const slash = s.lastIndexOf('/')
  if (slash >= 0) s = s.slice(slash + 1)
  s = s.replace(/&/g, ' and ')
  // Split letter/digit boundaries so "qwen2.5" and "Qwen 2.5" agree.
  s = s.replace(/([a-z])(\d)/g, '$1 $2')
  // Resolution and release-status noise.
  s = s.replace(/\b\d{3,4}p\b/g, ' ').replace(/\b(4k|8k)\b/g, ' ')
  s = s.replace(/\b(preview|latest)\b/g, ' ')
  s = s.replace(/[^a-z0-9]+/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  s = reorder(s)
  return MANUAL_ALIASES[s] ?? s
}

export function sameModel(a: string, b: string): boolean {
  return canonicalModel(a) === canonicalModel(b)
}
