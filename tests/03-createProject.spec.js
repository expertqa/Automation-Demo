import { test } from '@playwright/test';
import { qase } from 'playwright-qase-reporter/playwright';

import { ProjectPage } from '../pages/ProjectPage';

test(qase([8, 9, 10, 11, 12], 'TC-03 — Project'), async ({ page }) => {
  test.setTimeout(process.env.CI ? 180000 : 120000);

  const projectPage = new ProjectPage(page);

  await page.goto('/');

  let projectTitle;

  await test.step('TC-03.1 Create a new project', async () => {
    ({ projectTitle } = await projectPage.createProject());
  });

  await test.step('TC-03.2 – TC-03.4 Tags, full detail flow & Activities tab', async () => {
    await projectPage.completeProjectFlow();
  });

  await test.step('TC-03.5 Open created project from list', async () => {
    await page.getByRole('link', { name: projectTitle }).first().click();
  });
});
