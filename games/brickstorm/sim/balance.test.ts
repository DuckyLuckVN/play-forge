import { describe, expect, it } from 'vitest'
import { balanceReport, heroReport, simulateRun, type Bot } from './balance'
import type { HeroId } from './heroes'

// The browser tsconfig has no Node types; read the environment loosely.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}

describe('balance harness', () => {
  it('plays short runs with both bots, deterministically', () => {
    for (const bot of ['random', 'aimer', 'greedy'] as const) {
      const a = simulateRun(3, bot, 12)
      expect(a.turns).toBeGreaterThan(1)
      expect(a).toEqual(simulateRun(3, bot, 12))
    }
  }, 30_000) // the greedy bot plays every shot six times ahead

  // `npm run balance` writes the full report to BALANCE_OUT (default balance-report.txt).
  it.runIf(env.BALANCE)(
    'writes the balance report',
    async () => {
      const bots = env.BALANCE_BOTS?.split(',') as Bot[] | undefined
      const only = env.BALANCE_HERO_LIST?.split(',') as HeroId[] | undefined
      const report = only
        ? heroReport(
            Number(env.BALANCE_SEEDS ?? 20),
            (bots?.[0] ?? 'aimer') as Bot,
            only,
            Number(env.BALANCE_MAX ?? 300),
          )
        : balanceReport(Number(env.BALANCE_SEEDS ?? 20), bots, !!env.BALANCE_HEROES)
      // Node-only: this test runs only under `npm run balance`.
      const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as {
        writeFileSync(path: string, data: string): void
      }
      fs.writeFileSync(env.BALANCE_OUT ?? 'balance-report.txt', report + '\n')
    },
    600_000,
  )
})
