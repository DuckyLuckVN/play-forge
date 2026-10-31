import { describe, expect, it } from 'vitest'
import { balanceReport, simulateRun } from './balance'

// The browser tsconfig has no Node types; read the environment loosely.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}

describe('balance harness', () => {
  it('plays short runs with both bots, deterministically', () => {
    for (const bot of ['random', 'greedy'] as const) {
      const a = simulateRun(3, bot, 12)
      expect(a.turns).toBeGreaterThan(1)
      expect(a).toEqual(simulateRun(3, bot, 12))
    }
  })

  // `npm run balance` prints the full report against the targets.
  it.runIf(env.BALANCE)(
    'prints the balance report',
    () => {
      console.warn(balanceReport(Number(env.BALANCE_SEEDS ?? 20)))
    },
    600_000,
  )
})
