import { expect } from '@playwright/test';
import { generateRandomName } from '../utils/helper.js';
import { IdeaPage } from './IdeaPage.js';
import { FunnelPage } from './FunnelPage.js';

export class AutomationPage {
  constructor(page) {
    this.page = page;
    this.ideaPage = new IdeaPage(page);
    this.funnelPage = new FunnelPage(page);

    // Navigation
    this.settingsLink = page.getByRole('link', { name: 'Settings', exact: true });
    this.automationButton = page.getByRole('button', { name: 'Automation' });
    this.automationsLink = page.getByRole('link', { name: 'Automations' });

    // Rule creation
    this.addRuleButton = page.getByRole('button', { name: 'Add rule' });
    this.ruleNameTextbox = page.getByRole('textbox');
    this.enabledSwitch = page.getByRole('switch').first();
    this.saveButton = page.getByRole('button', { name: 'Save' });

    // Rule search / toggle
    this.searchRulesTextbox = page.getByRole('textbox', { name: 'Search rules' });
    // Not name-bound: confirmed live that this switch's aria-label itself
    // flips with its state (e.g. "Disabled" <-> something else), so a
    // locator bound to name: 'Disabled' stops matching anything the moment
    // it's toggled. Search narrows the list to the one target rule first,
    // so .first() reliably stays the same physical element regardless of
    // its label text.
    this.ruleDisabledSwitch = page.getByRole('switch').first();

    // Ideas navigation / idea edit
    this.ideasButton = page.getByRole('button', { name: 'Ideas' });
    this.closeButton = page.getByRole('button', { name: 'Close' });

    // Idea title update
    this.ideaTitleButton = page.getByRole('button', { name: 'Title', exact: true });
    this.ideaTitleTextbox = page.getByRole('textbox', { name: 'Title' });

    // Rule condition
    this.triggerFunnelCombobox = page.locator(
      'xpath=//*[normalize-space(text())="Funnel"][not(ancestor::table)]/following::button[@role="combobox"][1]'
    );
    this.suggestionsFirstOption = page.getByLabel('Suggestions').getByRole('option').first();
    this.suggestionsSecondOption = page.getByLabel('Suggestions').getByRole('option').nth(1);
    this.suggestionOptionByName = (name) => page.getByLabel('Suggestions').getByRole('option', { name, exact: true });

    // Idea's own Funnel field (Details tab)
    this.ideaFunnelFieldCombobox = page.locator(
      'xpath=//*[normalize-space(text())="Funnel"]/following::button[@role="combobox"][1]'
    );
    this.conditionFieldCombobox = page.getByRole('combobox').filter({ hasText: 'Idea score' });
    this.departmentFieldOption = page.locator('div').filter({ hasText: /^Department$/ }).nth(1);

    // Funnel switching
    this.funnelSwitcherCombobox = page.getByRole('combobox').first();
    this.funnelSearchTextbox = page.getByPlaceholder('Search', { exact: true });
    this.funnelOptionByName = (name) => page.getByText(name, { exact: false }).first();

    this.selectedFunnelName = null;

    // Idea link by title (dynamic)
    this.ideaLinkByTitle = (ideaTitle) => page.getByRole('link', { name: ideaTitle, exact: true });
    this.searchIdeasTextbox = page.getByRole('textbox', { name: 'Search ideas', exact: true });
  }

  //selectComboboxOption
  async selectComboboxOption(currentText, optionText, { inSuggestions = false, asOption = false } = {}) {
    await this.page.getByRole('combobox').filter({ hasText: currentText }).click();

    const option = asOption
      ? this.page.getByRole('option', { name: optionText, exact: true })
      : inSuggestions
        ? this.page.getByLabel('Suggestions').getByText(optionText, { exact: true })
        : this.page.getByText(optionText, { exact: true });

    await option.click();
  }

  //createRuleFunnel
  async createRuleFunnel() {
    // Reusing a shared, long-lived funnel means our rule collides with whatever
    // other active rules already route ideas there, so the platform marks it
    // "Blocked" ("Conflicting routing with active rule ..."). A fresh funnel per
    // run has no pre-existing rules, so there's nothing to conflict with.
    await this.funnelPage.createFunnel();

    // Don't trust the name we asked to be saved — the app can alter it (e.g.
    // trimming/dedup), so read back what's actually displayed. The combobox
    // label is "FunnelName (N)"; strip the trailing idea count.
    const displayedLabel = await this.funnelSwitcherCombobox.innerText();
    this.selectedFunnelName = displayedLabel.replace(/\s*\(\d+\)\s*$/, '').trim();

    console.log('✅ Dedicated funnel for automation rule created:', this.selectedFunnelName);

    return this.selectedFunnelName;
  }

  //navigateToAutomations
  async navigateToAutomations() {
    await this.settingsLink.click();
    await this.automationButton.click();
    await this.automationsLink.click();

    console.log('✅ Navigated to Automations successfully...');
  }

  //createRule
  async createRule() {
    const ruleName = generateRandomName('AutomationRule');

    await this.addRuleButton.click();

    await this.ruleNameTextbox.click();
    await this.ruleNameTextbox.press('ControlOrMeta+a');
    await this.ruleNameTextbox.fill(ruleName);

    await this.enabledSwitch.click();

    console.log('✅ Rule has been created successfully...');

    return ruleName;
  }

  //configureRuleCondition
  async configureRuleCondition() {
    // Trigger: scope the rule to the dedicated funnel created by createRuleFunnel()
    // (this.selectedFunnelName) — a shared funnel may already have other active
    // rules that conflict with this one and get it marked "Blocked".
    await this.triggerFunnelCombobox.click();
    await this.funnelSearchTextbox.fill(this.selectedFunnelName);
    const triggerFunnelOption = this.funnelOptionByName(this.selectedFunnelName);
    await triggerFunnelOption.waitFor({ state: 'visible', timeout: 20000 });
    await triggerFunnelOption.click();

    // Condition: field
    await this.conditionFieldCombobox.click();
    await this.departmentFieldOption.click();

    // Condition: value
    await this.selectComboboxOption('Select department', 'General');

    // Action: target lane (second option, since the first is usually already
    // the current/default lane and wouldn't be a meaningful "move to" target)
    await this.page.getByRole('combobox').filter({ hasText: 'Select lane' }).click();
    await this.suggestionsSecondOption.click();

    console.log('✅ Rule condition has been configured successfully...');
  }

  //saveRule
  async saveRule() {
    await this.saveButton.click();

    console.log('✅ Rule has been saved successfully...');
  }

  //searchRule
  async searchRule(ruleName) {
    await this.searchRulesTextbox.click();
    await this.searchRulesTextbox.fill(ruleName);

    console.log('✅ Rule has been searched successfully...');
  }

  //toggleRuleStatus
  async toggleRuleStatus(ruleName) {
    await this.searchRule(ruleName);

    const checkedBefore = await this.ruleDisabledSwitch.getAttribute('aria-checked');
    await this.ruleDisabledSwitch.click();
    await expect(this.ruleDisabledSwitch).not.toHaveAttribute('aria-checked', checkedBefore ?? '', { timeout: 10000 });
    const checkedAfter = await this.ruleDisabledSwitch.getAttribute('aria-checked');

    console.log('✅ Rule status has been toggled successfully...');

    await this.ideasButton.click();

    return { checkedBefore, checkedAfter };
  }

  //createIdea
  async createIdea() {
    const currentFunnelLabel = await this.funnelSwitcherCombobox.innerText();

    if (!currentFunnelLabel.includes(this.selectedFunnelName)) {
      await this.funnelSwitcherCombobox.click();
      await this.funnelSearchTextbox.fill(this.selectedFunnelName);
      await this.funnelOptionByName(this.selectedFunnelName).click();
    }

    const { ideaName } = await this.ideaPage.createIdea();
    await this.ideaPage.fillDetailsSection();

    // Must match the same funnel captured in configureRuleCondition(), not just
    // "whatever is first" here — otherwise the idea ends up in a different
    // funnel than the rule is scoped to, and the rule never fires on it.
    await this.ideaFunnelFieldCombobox.click();
    await this.suggestionOptionByName(this.selectedFunnelName).click();

    console.log('✅ New idea has been created successfully...');

    return ideaName;
  }

  //updateIdeaTitle
  async updateIdeaTitle(ideaTitle, newIdeaTitle) {
    // Fail fast and clearly if the caller passed a bad title, rather than
    // spending two minutes searching for "" or undefined and getting a bare
    // timeout that doesn't say why.
    expect(ideaTitle, 'updateIdeaTitle() was called without a valid ideaTitle').toBeTruthy();

    await this.ideasButton.click();

    await this.page
      .waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 15000 })
      .catch(() => {});

    const currentFunnelLabel = await this.funnelSwitcherCombobox.innerText();

    if (!currentFunnelLabel.includes(this.selectedFunnelName)) {
      await this.funnelSwitcherCombobox.click();
      await this.funnelSearchTextbox.fill(this.selectedFunnelName);
      await this.funnelOptionByName(this.selectedFunnelName).click();

      // Same loading-indicator condition as the wait above, applied to the
      // funnel switch's own list reload — not a guessed delay.
      await this.page
        .waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 15000 })
        .catch(() => {});
    }

    // Assert we're actually on the intended funnel, and that it reports at
    // least one idea, BEFORE the slow search-index wait below. The funnel
    // switcher's label is "FunnelName (N)" — N reflects the idea count
    // directly from the funnel view, independent of the search index, so
    // this catches "the idea never actually saved" or "we're on the wrong
    // funnel" immediately instead of after a 2-minute timeout that looks
    // identical for either cause.
    const funnelLabelAfterSwitch = await this.funnelSwitcherCombobox.innerText();
    expect(
      funnelLabelAfterSwitch,
      `Expected to be viewing funnel "${this.selectedFunnelName}" before searching for the idea, but the funnel switcher shows "${funnelLabelAfterSwitch}"`
    ).toContain(this.selectedFunnelName);

    const ideaCountMatch = funnelLabelAfterSwitch.match(/\((\d+)\)\s*$/);
    const ideaCount = ideaCountMatch ? Number(ideaCountMatch[1]) : 0;
    expect(
      ideaCount,
      `Funnel "${this.selectedFunnelName}" reports 0 ideas — "${ideaTitle}" likely failed to save, so searching for it would just time out uninformatively`
    ).toBeGreaterThan(0);

    // Wait for the idea to actually appear in the (unfiltered) list before
    // doing anything else — confirmed live that a freshly created idea in a
    // near-empty dedicated funnel renders here in ~10-15s, well before the
    // search index catches up. Searching immediately means we're racing the
    // slower of the two paths for no reason.
    const ideaLink = this.ideaLinkByTitle(ideaTitle);
    const appearedUnfiltered = await ideaLink
      .waitFor({ state: 'visible', timeout: 60000 })
      .then(() => true)
      .catch(() => false);

    if (!appearedUnfiltered) {
      // Fallback only: if the funnel has enough ideas that this one isn't
      // rendered without filtering (pagination), search for it. The search
      // index lags behind idea creation and the lag varies a lot by
      // domain/environment (a few seconds on some, well over a minute on
      // slower QA infra), so this generous wait is a last resort, not the
      // default path.
      await this.searchIdeasTextbox.fill(ideaTitle);
      await ideaLink.waitFor({ state: 'visible', timeout: 120000 });
    }

    await ideaLink.click();

    await this.ideaTitleButton.waitFor({ state: 'visible', timeout: 30000 });
    await this.ideaTitleButton.click();
    await this.ideaTitleTextbox.click();
    await this.ideaTitleTextbox.fill(newIdeaTitle);

    await this.closeButton.click();

    console.log('✅ Idea title has been updated successfully...');

    await this.ideasButton.click();
  }
}