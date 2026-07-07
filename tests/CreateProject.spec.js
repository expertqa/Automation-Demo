import { test } from '@playwright/test';

import { ProjectPage } from '../pages/ProjectPage';

test('Create Project and complete project flow', async ({ page }) => {
  test.setTimeout(process.env.CI ? 180000 : 120000);

  const projectPage = new ProjectPage(page);

  await page.goto('/');

  let projectTitle;

  await test.step('Create project', async () => {
    ({ projectTitle } = await projectPage.createProject());
  });

  await test.step('Complete project details flow', async () => {
    await projectPage.completeProjectFlow();
  });

  await test.step('Open created project', async () => {
    await page.getByRole('link', { name: projectTitle }).first().click();
  });
});
