import { expect, test } from '@playwright/test'

test('launcher lists games and opens Snake', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Play Forge' })).toBeVisible()
  await page.getByRole('link', { name: /Snake/ }).click()
  await expect(page.getByRole('heading', { name: 'Snake', level: 2 })).toBeVisible()
})

test('home button works from the game menu (above the overlay)', async ({ page }) => {
  await page.goto('games/snake/index.html')
  await page.getByRole('link', { name: 'All games' }).click()
  await expect(page.getByRole('heading', { name: 'Play Forge' })).toBeVisible()
})

test('sound settings are saved across reloads', async ({ page }) => {
  await page.goto('games/snake/index.html')
  await page.getByRole('button', { name: 'Sound settings' }).click()
  await page.getByLabel('Music volume').fill('20')
  await page.getByLabel('Effects volume').fill('60')
  await page.reload()
  await page.getByRole('button', { name: 'Sound settings' }).click()
  await expect(page.getByLabel('Music volume')).toHaveValue('20')
  await expect(page.getByLabel('Effects volume')).toHaveValue('60')
  // Shared with the launcher too.
  await page.goto('/')
  await page.getByRole('button', { name: 'Sound settings' }).click()
  await expect(page.getByLabel('Music volume')).toHaveValue('20')
})

test('rejects a malformed room code', async ({ page }) => {
  await page.goto('games/snake/index.html')
  await page.getByLabel('Room code').fill('AB')
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page.getByText('Room codes are 5 characters')).toBeVisible()
})

test('the menu fits a phone screen without sideways scrolling @phone', async ({ page }) => {
  await page.goto('games/snake/index.html')
  await expect(page.getByRole('button', { name: 'Create room' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
