import { test } from '@playwright/test';

import { FunnelPage } from '../pages/FunnelPage';
import { IdeaPage } from '../pages/IdeaPage';
import { KanbanPage } from '../pages/IdeaKanabanPage.js';

test('Create Funnel, add Idea and move it through Kanban stages', async ({ page }) => {
  test.setTimeout(process.env.CI ? 180000 : 120000);

  const funnelPage = new FunnelPage(page);
  const ideaPage = new IdeaPage(page);
  const kanbanPage = new KanbanPage(page);

  await page.goto('/');

  let ideaTitle;

  await test.step('Create funnel', async () => {
    await funnelPage.createFunnel();
  });

  await test.step('Create idea', async () => {
    ({ ideaName: ideaTitle } = await ideaPage.createIdea());
  });

  await test.step('Fill in idea details', async () => {
    await ideaPage.completeIdeaFlow();
  });

  await test.step('Move idea through Kanban stages', async () => {
    await kanbanPage.moveIdeaToStage1(ideaTitle, '2. Review idea');
  });
});
