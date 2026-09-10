import { expect, test } from '@playwright/test';

// No describe block on purpose: the suite name is derived from the file name ("User Profile").

test('TC-10 — Profile page renders', async ({ page }) => {
  await page.setContent('<h1 id="name">Ahsan</h1><p data-testid="role">QA Lead</p>');
  await expect(page.locator('#name')).toHaveText('Ahsan');
  await expect(page.getByTestId('role')).toContainText('QA');
});

test('TC-11 — Avatar upload times out', async ({ page }) => {
  test.setTimeout(1500);
  await page.setContent('<button id="upload">Upload</button>');
  console.error('upload endpoint is slow today');
  await page.waitForTimeout(5000); // exceeds the test timeout → timedOut
});
