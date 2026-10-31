import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const BRICKSTORM = 'games/brickstorm/index.html?seed=1&debug'

/** Reads a field of the running Brickstorm state (exposed with ?debug). */
const state = (page: Page, key: string) =>
  page.evaluate((k) => {
    const s = (
      window as unknown as { __brickstorm: { state(): Record<string, unknown> } }
    ).__brickstorm.state()
    return s?.[k]
  }, key)

test('brickstorm: starts, fires a volley and reaches turn 2', async ({ page }) => {
  await page.goto(BRICKSTORM)
  await page.getByRole('button', { name: 'Play' }).click()
  await page.keyboard.press('Space')
  await expect.poll(() => state(page, 'turn'), { timeout: 20_000 }).toBe(2)
})

test('brickstorm: a hidden tab pauses mid-volley', async ({ page }) => {
  await page.goto(BRICKSTORM)
  await page.getByRole('button', { name: 'Play' }).click()
  await page.keyboard.press('Space')
  await expect.poll(() => state(page, 'phase')).toBe('volley')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible()
  const before = await state(page, 'volleyTime')
  await page.waitForTimeout(500)
  expect(await state(page, 'volleyTime')).toBe(before)
})

test('brickstorm: the built single file works straight from disk (file://)', async ({ page }) => {
  const file = path.resolve('dist/games/brickstorm/index.html')
  await page.goto(pathToFileURL(file).href)
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recall' })).toBeVisible()
})
