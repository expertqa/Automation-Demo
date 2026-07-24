import { test } from '@playwright/test';

import { FunnelPage } from '../pages/FunnelPage';
import { IdeaPage } from '../pages/IdeaPage';
import { KanbanPage } from '../pages/IdeaKanabanPage.js';

test('TC-02 — Funnel, Idea & Kanban', async ({ page }) => {
  test.setTimeout(process.env.CI ? 180000 : 120000);

  const funnelPage = new FunnelPage(page);
  const ideaPage = new IdeaPage(page);
  const kanbanPage = new KanbanPage(page);

  await page.goto('/');

  let ideaTitle;

  await test.step('TC-02.1 Create a new idea funnel', async () => {
    await funnelPage.createFunnel();
  });

  await test.step('TC-02.2 Create an idea inside the funnel', async () => {
    ({ ideaName: ideaTitle } = await ideaPage.createIdea());
  });

  await test.step('TC-02.3 Complete full idea detail flow', async () => {
    await ideaPage.completeIdeaFlow();
  });

  await test.step('TC-02.4 Move idea through Kanban stages', async () => {
    await kanbanPage.moveIdeaToStage1(ideaTitle, '2. Review idea');
  });
});
