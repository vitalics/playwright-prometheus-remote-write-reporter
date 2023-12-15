import { setTimeout } from 'node:timers/promises'
import { test, expect } from '@playwright/test';
import { Counter } from 'playwright-prometheus-remote-writer-reporter'

const goesCounter = new Counter({
  name: 'url',
  url: 'playwright.dev'
}, 1)

test('has title', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  goesCounter.inc().collect();
  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Playwright/);
  console.log('Good for you!')
});

test('get started link', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  goesCounter.inc().collect();
  // Click the get started link.
  await page.getByRole('link', { name: 'Get started' }).click();

  await setTimeout(10_000)

  await test.info().attach('attachment.json', {
    contentType: 'application/json',
    body: JSON.stringify({ key: 'value' })
  })

  test.info().annotations.push({
    type: 'custom annotation',
    description: 'my custom description'
  })

  // Expects page to have a heading with the name of Installation.
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});
