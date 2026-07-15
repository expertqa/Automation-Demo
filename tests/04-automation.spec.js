import { test } from '@playwright/test';

import { AutomationPage } from '../pages/AutomationPage';

test('Create automation rule and verify it triggers on idea update', async ({ page }) => {
  test.setTimeout(process.env.CI ? 240000 : 180000);

  const automationPage = new AutomationPage(page);

  await page.goto('/');

  await test.step('Create a dedicated funnel for this rule', async () => {
    await automationPage.createRuleFunnel();
  });

  await test.step('Navigate to Automations', async () => {
    await automationPage.navigateToAutomations();
  });

  let ruleName;

  await test.step('Create and configure automation rule', async () => {
    ruleName = await automationPage.createRule();
    await automationPage.configureRuleCondition();
    await automationPage.saveRule();
  });

  await test.step('Search and toggle rule status', async () => {
    await automationPage.toggleRuleStatus(ruleName);
  });

  let ideaTitle;

  await test.step('Create a new idea', async () => {
    ideaTitle = await automationPage.createIdea();
  });


  await test.step('Update idea title', async () => {
    const newIdeaTitle = ideaTitle + '-updated';
    await automationPage.updateIdeaTitle(ideaTitle, newIdeaTitle);
  });
});