import { test, expect } from '@playwright/test';

import { ProjectPage } from '../pages/ProjectPage';

test('TC-03 — Project', async ({ page }) => {
  // TC-03.5's list wait (60s, possibly retried once) needs real headroom
  // beyond the rest of the flow's normal budget.
  test.setTimeout(process.env.CI ? 240000 : 180000);

  const projectPage = new ProjectPage(page);

  await page.goto('/');

  let projectTitle;

  await test.step('TC-03.1 Create a new project', async () => {
    ({ projectTitle } = await projectPage.createProject());

    expect(projectTitle, 'createProject() should return the title it used').toBeTruthy();
  });

  await test.step('TC-03.2 – TC-03.4 Tags, full detail flow & Activities tab', async () => {
    await projectPage.completeProjectFlow();

    // Sanity check that the whole bundled flow (tags, details, task, canvas,
    // problem, assumption, experiment, risk, decision, lesson, comment,
    // activities) left us on the same project rather than silently
    // navigating away or erroring out partway through.
    await expect(page, 'Should still be on the project detail page after the full flow').toHaveURL(/\/studio\/projects?\//i);
  });

  await test.step('TC-03.5 Open created project from list', async () => {
    // Actually navigate to the projects list first — without this, the
    // previous step leaves us on the project's own detail page, and this
    // step was matching a same-name link there instead (likely a stray
    // breadcrumb/self-reference), not testing "open from the list" at all.
    await projectPage.projectsButton.click();

    // The default (unfiltered) list doesn't reliably show a just-created
    // project — confirmed live: it displayed only much older projects, none
    // from this run, even after 60s. Same "list lags behind creation"
    // pattern as Tasks, and the same fix: search for it explicitly.
    await projectPage.searchProjectsTextbox.fill(projectTitle);

    const projectLink = page.getByRole('link', { name: projectTitle }).first();
    await expect(projectLink, 'Newly created project should appear in the projects list once searched').toBeVisible({ timeout: 30000 });
    await projectLink.click();

    // If this still 404s ("This page does not exist"), that's a real backend
    // timing issue (the list can show a project before its route is fully
    // ready) — give it one retry from the list rather than fail outright on
    // a flake outside our control.
    const opened = await expect(page.getByText(projectTitle).first(), 'Opened project should show the correct title')
      .toBeVisible({ timeout: 30000 })
      .then(() => true)
      .catch(() => false);

    if (!opened) {
      console.log('⚠️ Opening the project 404\'d or failed to load on the first attempt — retrying once from the list.');
      await projectPage.projectsButton.click();
      await projectPage.searchProjectsTextbox.fill(projectTitle);
      await expect(projectLink, 'Project should still appear in the list on retry').toBeVisible({ timeout: 30000 });
      await projectLink.click();
      await expect(page.getByText(projectTitle).first(), 'Opened project should show the correct title after retry').toBeVisible({ timeout: 30000 });
    }
  });
});
