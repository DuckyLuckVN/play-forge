import { expect, test } from '@playwright/test'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { waitForGo } from './helpers'

test('solo game: countdown, pause, resume, game over, play again', async ({ page }) => {
  await page.goto('games/snake/index.html')
  await page.getByRole('button', { name: 'Play solo' }).click()
  await waitForGo(page)
  await expect(page.locator('.pf-chip')).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible()
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeHidden()

  // Untouched, the snake runs into the wall.
  await expect(page.getByText(/You ate \d+ apples?/)).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Play again' }).click()
  await waitForGo(page)
})

test('the built single file works straight from disk (file://)', async ({ page }) => {
  const file = path.resolve('dist/games/snake/index.html')
  await page.goto(pathToFileURL(file).href)
  await page.getByRole('button', { name: 'Play solo' }).click()
  await waitForGo(page)
})
