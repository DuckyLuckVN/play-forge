import { test as base } from '@playwright/test'
import { readFileSync } from 'node:fs'

export { expect } from '@playwright/test'

const GAME_IDS: string[] = JSON.parse(readFileSync('games/games.json', 'utf8')).map(
  (g: { id: string }) => g.id,
)

/**
 * Every test plays as a returning player: the first-play "How to play" help
 * (engine/ui/guide.ts) would otherwise open over the menu, room and stage.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript((ids) => {
      try {
        for (const id of ids) localStorage.setItem(`play-forge:guide-seen:${id}`, '1')
      } catch {
        // storage blocked: the help opens as for a new player
      }
    }, GAME_IDS)
    await use(context)
  },
})
