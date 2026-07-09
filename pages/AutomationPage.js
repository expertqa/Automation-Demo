import { generateRandomName } from '../utils/helper.js';
import { IdeaPage } from './IdeaPage.js';

export class AutomationPage {
  constructor(page) {
    this.page = page;
    this.ideaPage = new IdeaPage(page);

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
    this.agileFlowSuggestion = page.getByLabel('Suggestions').getByText('Agile Flow', { exact: true });
    this.conditionFieldCombobox = page.getByRole('combobox').filter({ hasText: 'Idea score' });
    this.departmentFieldOption = page.locator('div').filter({ hasText: /^Department$/ }).nth(1);

    // Funnel switching
    this.funnelSwitcherCombobox = page.getByRole('combobox').first();
    this.funnelSearchTextbox = page.getByPlaceholder('Search', { exact: true });
    this.agileFlowOption = page.getByRole('option', { name: 'Agile Flow', exact: true });

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
    // Trigger: select the funnel this rule applies to
    await this.triggerFunnelCombobox.click();
    await this.agileFlowSuggestion.click();

    // Condition: field
    await this.conditionFieldCombobox.click();
    await this.departmentFieldOption.click();

    // Condition: value
    await this.selectComboboxOption('Select department', 'General');

    // Action: target lane
    await this.selectComboboxOption('Select lane', 'Review idea');

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
   
    const { ideaName } = await this.ideaPage.createIdea();
    await this.ideaPage.fillDetailsSection();
    console.log('✅ New idea has been created successfully...');

    return ideaName;
  }

  //updateIdeaTitle
  async updateIdeaTitle(ideaTitle, newIdeaTitle) {
    await this.ideasButton.click();

    await this.page.waitForLoadState('networkidle');

    await this.searchIdeasTextbox.fill(ideaTitle);
    await this.ideaLinkByTitle(ideaTitle).click();

    await this.ideaTitleButton.click();
    await this.ideaTitleTextbox.click();
    await this.ideaTitleTextbox.fill(newIdeaTitle);

    await this.closeButton.click();

    console.log('✅ Idea title has been updated successfully...');

    await this.ideasButton.click();
  }
}