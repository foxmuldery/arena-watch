import { BOARDS, fetchBoard } from '../src/main/adapters'

/**
 * Smoke test: fetch every board from the live data sources and print the
 * top 5. Run with `npm run smoke`. This is the fastest way to notice when an
 * upstream page/dataset changes shape.
 */
async function main(): Promise<void> {
  let failures = 0
  for (const def of BOARDS) {
    try {
      const entries = await fetchBoard(def.id)
      console.log(`\n== ${def.id} — ${entries.length} entries`)
      for (const e of entries.slice(0, 5)) {
        console.log(`  #${e.rank} ${e.model} (${e.org || '—'}) — ${e.score}`)
      }
      if (entries.length < 5) {
        failures++
        console.error(`  !! suspiciously few entries`)
      }
    } catch (err) {
      failures++
      console.error(`\n== ${def.id} FAILED: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  console.log(`\nDone. ${BOARDS.length - failures}/${BOARDS.length} boards OK.`)
  if (failures > 0) process.exitCode = 1
}

void main()
