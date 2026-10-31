import { expect, type BrowserContext, type Page } from '@playwright/test'

export const SNAKE = 'games/snake/index.html?net=local'

export async function openSnake(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage()
  await page.goto(SNAKE)
  await page.getByLabel('Your name').fill(name)
  return page
}

export async function roomCode(page: Page): Promise<string> {
  const code = page.locator('.pf-room-code')
  await expect(code).toBeVisible()
  return code.evaluate((el) => el.lastChild?.textContent ?? '')
}

/** Host creates a room, guest joins it; returns the room code. */
export async function hostAndGuest(host: Page, guest: Page): Promise<string> {
  await host.getByRole('button', { name: 'Create room' }).click()
  const code = await roomCode(host)
  await guest.getByLabel('Room code').fill(code)
  await guest.getByRole('button', { name: 'Join' }).click()
  await expect(seat(host, 'Bob')).toBeVisible()
  await expect(guest.getByRole('button', { name: "I'm ready" })).toBeVisible()
  return code
}

/** A filled seat in the lobby, found by player name. */
export const seat = (page: Page, name: string) => page.locator('.pf-seat:not(.empty)', { hasText: name })

export async function waitForGo(page: Page) {
  await expect(page.locator('.pf-countdown')).toHaveText('Go!', { timeout: 8000 })
}
