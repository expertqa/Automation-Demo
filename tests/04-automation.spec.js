import { test } from '@playwright/test';

import { AutomationPage } from '../pages/AutomationPage';

test('TC-04 — Automation Rules', async ({ page }) => {
  // The idea-search wait in updateIdeaTitle() alone can take up to 120s on
  // slower QA infra, so the overall budget needs real headroom beyond that
  // for the rest of the steps, not just enough to cover it exactly.
  test.setTimeout(process.env.CI ? 300000 : 240000);

  const automationPage = new AutomationPage(page);

  await page.goto('/');

  await test.step('TC-04.1 Create a dedicated funnel for the rule', async () => {
    await automationPage.createRuleFunnel();
  });

  await test.step('TC-04.2 Navigate to Automations', async () => {
    await automationPage.navigateToAutomations();
  });

  let ruleName;

  await test.step('TC-04.3 Create and configure an automation rule', async () => {
    ruleName = await automationPage.createRule();
    await automationPage.configureRuleCondition();
    await automationPage.saveRule();
  });

  await test.step('TC-04.4 Search and toggle rule status', async () => {
    await automationPage.toggleRuleStatus(ruleName);
  });

  let ideaTitle;

  await test.step('TC-04.5 Create an idea in the scoped funnel', async () => {
    ideaTitle = await automationPage.createIdea();
  });


  await test.step('TC-04.6 Verify rule triggers on idea update', async () => {
    const newIdeaTitle = ideaTitle + '-updated';
    await automationPage.updateIdeaTitle(ideaTitle, newIdeaTitle);
  });
});