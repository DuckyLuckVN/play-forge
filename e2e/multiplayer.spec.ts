import { expect, test } from '@playwright/test'
import { hostAndGuest, openSnake, seat, waitForGo } from './helpers'

test('lobby: seats, ready-up, start, and guest input reaching the host', async ({ context }) => {
  const host = await openSnake(context, 'Alice')
  const guest = await openSnake(context, 'Bob')
  await hostAndGuest(host, guest)

  await expect(seat(host, 'Alice')).toContainText('Host')
  await expect(seat(host, 'Bob')).toContainText('Not ready')
  const start = host.getByRole('button', { name: 'Start game' })
  await expect(start).toBeDisabled()
  await expect(host.getByText('Waiting for Bob to get ready.')).toBeVisible()

  await guest.getByRole('button', { name: "I'm ready" }).click()
  await expect(seat(host, 'Bob')).toContainText('Ready')
  await expect(start).toBeEnabled()
  await start.click()

  await Promise.all([waitForGo(host), waitForGo(guest)])
  // Bob dives into the bottom wall; idle Alice outlives him.
  await guest.keyboard.press('ArrowDown')
  await expect(host.getByText('You win!')).toBeVisible({ timeout: 15_000 })
  await expect(guest.getByText('Alice wins')).toBeVisible()
  // Rematch needs everyone ready again.
  await expect(host.getByRole('button', { name: 'Start rematch' })).toBeDisabled()
})

test('a guest who reloads gets their seat back', async ({ context }) => {
  const host = await openSnake(context, 'Alice')
  const guest = await openSnake(context, 'Bob')
  await hostAndGuest(host, guest)
  const color = await seat(host, 'Bob')
    .locator('.pf-token')
    .evaluate((el) => getComputedStyle(el).backgroundColor)

  await guest.reload()
  await expect(host.locator('.pf-toast', { hasText: 'Bob is back' })).toBeVisible()
  await expect(guest.locator('.pf-seat.self')).toHaveAttribute('title', 'Bob (you)')
  await expect(host.locator('.pf-seat:not(.empty)')).toHaveCount(2)
  const after = await seat(host, 'Bob')
    .locator('.pf-token')
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(after).toBe(color)
})

test('a guest who reloads mid-match keeps control of their snake', async ({ context }) => {
  const host = await openSnake(context, 'Alice')
  const guest = await openSnake(context, 'Bob')
  await hostAndGuest(host, guest)
  await guest.getByRole('button', { name: "I'm ready" }).click()
  await host.getByRole('button', { name: 'Start game' }).click()
  await waitForGo(guest)

  await guest.reload()
  await expect(guest.locator('.pf-chip.self')).toBeVisible()
  // If control came back, Bob's dive decides the match; otherwise both
  // snakes hit the side walls on the same tick and it's a draw.
  await guest.keyboard.press('ArrowDown')
  await expect(host.getByText('You win!')).toBeVisible({ timeout: 15_000 })
})

test('when the host reloads, guests wait and then follow the reopened room', async ({ context }) => {
  const host = await openSnake(context, 'Alice')
  const guest = await openSnake(context, 'Bob')
  const code = await hostAndGuest(host, guest)

  await host.reload()
  await expect(guest.locator('.pf-toast', { hasText: 'The host is back' })).toBeVisible()
  await expect(host.locator('.pf-room-code')).toContainText(code)
  await expect(host.locator('.pf-seat:not(.empty)')).toHaveCount(2)
  await expect(guest.getByRole('button', { name: "I'm ready" })).toBeVisible()
})

test('leaving on purpose frees the seat at once', async ({ context }) => {
  const host = await openSnake(context, 'Alice')
  const guest = await openSnake(context, 'Bob')
  await hostAndGuest(host, guest)

  await guest.locator('.pf-panel').getByRole('button', { name: 'Leave room' }).click()
  await expect(host.locator('.pf-toast', { hasText: 'Bob left' })).toBeVisible()
  await expect(host.locator('.pf-seat:not(.empty)')).toHaveCount(1)
})

test('guests see the room close when the host leaves', async ({ context }) => {
  const host = await openSnake(context, 'Alice')
  const guest = await openSnake(context, 'Bob')
  await hostAndGuest(host, guest)

  await host.locator('.pf-panel').getByRole('button', { name: 'Leave room' }).click()
  await expect(guest.getByRole('heading', { name: 'The room closed' })).toBeVisible()
})

test('the host picks the speed; guests see it but cannot change it', async ({ context }) => {
  const host = await openSnake(context, 'Alice')
  const guest = await openSnake(context, 'Bob')
  await hostAndGuest(host, guest)

  const guestSpeed = guest.getByRole('radiogroup', { name: 'Speed' })
  await expect(guestSpeed.getByRole('radio', { name: 'Normal' })).toHaveAttribute('aria-checked', 'true')
  await expect(guestSpeed.getByRole('radio', { name: 'Fast' })).toBeDisabled()

  await host.getByRole('radiogroup', { name: 'Speed' }).getByRole('radio', { name: 'Fast' }).click()
  await expect(guestSpeed.getByRole('radio', { name: 'Fast' })).toHaveAttribute('aria-checked', 'true')
  await expect(guest.locator('.pf-toast', { hasText: 'Speed: Fast' })).toBeVisible()
})
