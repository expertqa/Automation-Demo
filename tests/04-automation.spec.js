import { test } from '@playwright/test';
import { qase } from 'playwright-qase-reporter/playwright';

import { AutomationPage } from '../pages/AutomationPage';

test(qase([13, 14, 15, 16, 17, 18], 'TC-04 — Automation Rules'), async ({ page }) => {
  test.setTimeout(process.env.CI ? 240000 : 180000);

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