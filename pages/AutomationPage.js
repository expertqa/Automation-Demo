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
    this.ruleDisabledSwitch = page.getByRole('switch', { name: 'Disabled' });

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
    // The first option in these "Suggestions" listboxes is usually the current/
    // default value (e.g. the lane a "move to lane" action already points at),
    // so picking the second gives a genuinely different target.
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

    // Captured once (from configureRuleCondition) so every later funnel
    // reference points at the same funnel the automation rule is scoped to.
    this.selectedFunnelName = null;

    // Idea link by title (dynamic)
    this.ideaLinkByTitle = (ideaTitle) => page.getByRole('link', { name: ideaTitle, exact: true });
    this.searchIdeasTextbox = page.getByRole('textbox', { name: 'Search ideas' });
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

    await this.ruleDisabledSwitch.click();

    console.log('✅ Rule status has been toggled successfully...');

    await this.ideasButton.click();
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
    await this.ideasButton.click();

    await this.page
      .waitForFunction(() => !document.querySelector('.animate-pulse'), { timeout: 15000 })
      .catch(() => {});

    const currentFunnelLabel = await this.funnelSwitcherCombobox.innerText();

    if (!currentFunnelLabel.includes(this.selectedFunnelName)) {
      await this.funnelSwitcherCombobox.click();
      await this.funnelSearchTextbox.fill(this.selectedFunnelName);
      await this.funnelOptionByName(this.selectedFunnelName).click();
    }
    await this.page.waitForTimeout(6000);
    await this.searchIdeasTextbox.fill(ideaTitle);

    // The search index lags behind idea creation, and the lag varies a lot by
    // domain/environment (a few seconds on some, well over a minute on slower
    // QA infra). networkidle doesn't help since there's no ongoing network
    // activity to wait on, so give the link a single generous wait instead of
    // re-filling the search box (which would just reset any server-side debounce).
    const ideaLink = this.ideaLinkByTitle(ideaTitle);
    await ideaLink.waitFor({ state: 'visible', timeout: 120000 });

    await ideaLink.click();

    await this.ideaTitleButton.click();
    await this.ideaTitleTextbox.click();
    await this.ideaTitleTextbox.fill(newIdeaTitle);

    await this.closeButton.click();

    console.log('✅ Idea title has been updated successfully...');

    await this.ideasButton.click();
  }
}