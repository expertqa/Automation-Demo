import { expect, test } from '@playwright/test';

test.describe('QA Dashboard', () => {
  test('overview shows the latest execution, KPIs and charts', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText('Latest execution')).toBeVisible();
    await expect(page.getByText('Total tests', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Pass / fail trend')).toBeVisible();
    await expect(page.getByText('Execution duration')).toBeVisible();
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible();
    await expect(page.getByText('demo data loaded')).toBeVisible();
    await expect(page.getByText('Recent runs')).toBeVisible();
    await expect(page.locator('[data-testid=run-row]').first()).toBeVisible();
  });

  test('runs list filters, searches and opens run details with suites → files → tests', async ({ page }) => {
    await page.goto('/runs');
    const rows = page.locator('[data-testid=run-row]');
    await expect(rows.first()).toBeVisible();
    const total = await rows.count();
    expect(total).toBeGreaterThan(5);

    await page.getByLabel('Status').selectOption('failed');
    await expect.poll(async () => rows.count()).toBeLessThan(total);
    await expect(page.locator('[data-testid=run-row]').first().getByText('Failed')).toBeVisible();
    await page.getByLabel('Status').selectOption('');

    await page.getByLabel('Search runs').fill('run_demo_003');
    await expect.poll(async () => rows.count()).toBe(1);
    await rows.first().click();
    await expect(page).toHaveURL(/\/runs\/run_demo_003/);
    await expect(page.getByText('Suites', { exact: true })).toBeVisible();
    const suiteRows = page.locator('[data-testid=suite-row]');
    await expect(suiteRows.first()).toBeVisible();
    // expand the first suite and expect test rows
    await suiteRows.first().click();
    await expect(page.locator('[data-testid=test-row]').first()).toBeVisible();
  });

  test('global scope filter narrows every page and is kept in the URL', async ({ page }) => {
    await page.goto('/runs');
    await page.getByLabel('Environment').selectOption('staging');
    await expect(page).toHaveURL(/environment=staging/);
    const rows = page.locator('[data-testid=run-row]');
    await expect(rows.first()).toBeVisible();
    for (const row of await rows.all()) await expect(row).toContainText('staging');
    await page.getByRole('link', { name: 'Tests', exact: true }).click();
    await expect(page).toHaveURL(/\/tests\?.*environment=staging/);
  });

  test('failure page shows error, screenshots, video and trace tabs with GitHub links', async ({ page }) => {
    await page.goto('/failures');
    const row = page.locator('[data-testid=failure-row]').first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(/\/executions\/\d+\?tab=error/);
    await expect(page.getByText(/^(FAILED|TIMED OUT|INTERRUPTED)$/).first()).toBeVisible();
    await expect(page.getByTestId('view-source')).toHaveAttribute('href', /github\.com\/.+\/blob\/[0-9a-f]{40}\/tests\/.+#L\d+/);
    await expect(page.getByTestId('error-message').first()).toBeVisible();
    await expect(page.getByTestId('error-snippet').first()).toBeVisible();

    await page.getByTestId('tab-screenshots').click();
    const thumb = page.getByTestId('screenshot-thumb').first();
    await expect(thumb).toBeVisible();
    await expect(thumb.locator('img')).toHaveJSProperty('naturalWidth', 1280);
    await thumb.click();
    await expect(page.getByTestId('screenshot-preview')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByTestId('tab-video').click();
    const video = page.getByTestId('video-player').first();
    await expect(video).toBeVisible();
    await expect(video.locator('source')).toHaveAttribute('src', /\/api\/artifacts\/\d+\/video-r\d\.webm/);
    const src = await video.locator('source').getAttribute('src');
    const head = await page.request.head(src!);
    expect(head.status()).toBe(200);
    expect(head.headers()['content-type']).toBe('video/webm');

    await page.getByRole('tab', { name: /Trace/ }).click();
    await expect(page.getByTestId('open-trace').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /trace\.playwright\.dev/ }).first()).toBeVisible();

    await page.getByRole('tab', { name: /Logs/ }).click();
    await expect(page.getByText('stdout', { exact: true })).toBeVisible();
    await expect(page.getByText('Retry number', { exact: false }).first()).toBeVisible();
  });

  test('test history page shows the execution strip, stats and executions', async ({ page }) => {
    await page.goto('/tests?q=TC-06');
    const row = page.locator('[data-testid=test-list-row]').first();
    await expect(row).toBeVisible();
    await row.getByText(/TC-06/).first().click();
    await expect(page).toHaveURL(/\/tests\/[a-f0-9]{20}/);
    await expect(page.getByText('Last executions (newest first)')).toBeVisible();
    await expect(page.locator('[aria-label="recent executions"] a').first()).toBeVisible();
    await expect(page.getByText('Pass rate', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Executions', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'View Source on GitHub' })).toHaveAttribute('href', /github\.com/);
  });

  test('suites page lists suites with reliability and drills into files and tests', async ({ page }) => {
    await page.goto('/suites');
    const rows = page.locator('[data-testid=suite-list-row]');
    await expect(rows.first()).toBeVisible();
    await expect(rows.filter({ hasText: 'Login' })).toHaveCount(1);
    await rows.filter({ hasText: 'Login' }).click();
    await expect(page).toHaveURL(/\/suites\/[a-f0-9]{16}/);
    await expect(page.getByText('Historical reliability')).toBeVisible();
    await expect(page.locator('[data-testid=test-list-row]').first()).toBeVisible();
  });

  test('flaky page explains why tests are flagged', async ({ page }) => {
    await page.goto('/flaky');
    const rows = page.locator('[data-testid=flaky-row]');
    await expect(rows.first()).toBeVisible();
    await expect(rows.first()).toContainText(/retry|failure rate|transitions/);
  });

  test('global search finds tests and navigates', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Global search').fill('Campaign');
    await expect(page.getByRole('button', { name: /TC-07/ }).first()).toBeVisible();
    await page.getByRole('button', { name: /TC-07/ }).first().click();
    await expect(page).toHaveURL(/\/tests\/[a-f0-9]{20}/);
  });

  test('settings can be changed and restored', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Flaky detection' })).toBeVisible();
    await page.getByLabel('Window (executions)').fill('7');
    await page.getByTestId('save-settings').click();
    await expect(page.getByTestId('settings-message')).toContainText('Settings saved');
    await page.reload();
    await expect(page.getByLabel('Window (executions)')).toHaveValue('7');
    await page.getByRole('button', { name: 'Restore defaults' }).click();
    await expect(page.getByLabel('Window (executions)')).toHaveValue('20');
  });

  test('theme toggle switches dark mode', async ({ page }) => {
    await page.goto('/');
    const before = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    const after = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(after).toBe(!before);
  });
});
