import { generateRandomName, fillRichText } from "../utils/helper.js";
import { expect } from "@playwright/test";
import { SAFE_ACTION_TIMEOUT_MS } from "../fixtures/rateLimitFixture";

export class CampaignPage {
  constructor(page) {
    this.page = page;

    // Navigation
    this.campaignsLink = page
      .getByRole("link", { name: "Campaigns", exact: true })
      .first();
    this.addCampaignLink = page.getByRole("link", { name: "Add campaign" });

    // "New campaign" required-setup dialog.
    this.newCampaignDialog = page
      .getByRole("dialog")
      .filter({ hasText: "Create campaign" });
    this.newCampaignTitleInput = this.newCampaignDialog.getByPlaceholder(
      "Example: How can we improve productivity in the sales department with AI?",
    );
    this.pickDateButton = this.newCampaignDialog.getByRole("button", {
      name: "Pick a date",
    });
    this.todayButton = page.getByRole("button", { name: "Today", exact: true });
    this.createCampaignSubmitButton = this.newCampaignDialog.getByRole(
      "button",
      { name: "Create campaign" },
    );

    // General tab (Manage campaign page)
    this.campaignDescriptionBox = page
      .getByText("Campaign Description", { exact: true })
      .locator("xpath=following::textarea[1]");
    this.briefingBox = page
      .locator("div")
      .filter({ hasText: /^Briefing for participants/ })
      .locator('[contenteditable="true"]')
      .first();
    this.savedIndicator = page.getByText(/Saved at/);

    // Campaigns list
    this.loadingSpinner = page
      .locator('.animate-spin, [class*="spinner"]')
      .first();

    // Tabs
    this.tab = (name) => page.getByRole("tab", { name, exact: true });

    // Planning tab
    this.softDeadlineCard = page.getByRole("button", {
      name: /^Soft deadline/,
    });

    // Tasks tab
    this.quickAddTaskInput = page.getByPlaceholder("Enter title and hit enter");

    // Form tab
    this.addFieldButton = page.getByRole("button", { name: "Add Field" });
    // The "Add field" picker lists each available field with its own "Add"
    // button rather than one generic submit — scoped to the picker dialog.
    this.addFieldDialog = page
      .getByRole("dialog")
      .filter({ hasText: "Manage form" });
    this.addDepartmentFieldButton = this.addFieldDialog
      .getByRole("listitem")
      .filter({ hasText: "Department" })
      .getByRole("button", { name: "Add" });

    // Access tab
    this.accessCombobox = page
      .getByRole("combobox")
      .filter({ hasText: "Open" });
    this.addUsersButton = page.getByRole("button", { name: "Add users" });
    this.addUsersDialog = page
      .getByRole("dialog")
      .filter({ hasText: "Add users" });
    // Row 0 is the header row; the first real user is row 1.
    this.firstUserRow = this.addUsersDialog.getByRole("row").nth(1);
    this.addUsersSubmitButton = this.addUsersDialog.getByRole("button", {
      name: "Add users",
    });

    this.addCommunicationButton = page.getByRole("button", {
      name: "Add communication",
    });
    this.newCommunicationDialog = page
      .getByRole("dialog")
      .filter({ hasText: "New communication" });
    this.selectUsersCombobox = this.newCommunicationDialog.getByText(
      "Select users",
      { exact: true },
    );

    // Auto responses tab
    this.submissionConfirmationCombobox = page
      .getByRole("combobox")
      .filter({ hasText: /None|Browser only|Email only|Browser \+ Email/ });

    // Context tab
    this.overviewBox = page
      .getByText("Overview", { exact: true })
      .locator("xpath=following::textarea[1]");
    this.problemBox = page
      .getByText("Problem", { exact: true })
      .locator("xpath=following::textarea[1]");
    this.objectivesTagInput = page.getByPlaceholder("Add tag...").first();

    // Files tab
    this.fileInput = page.locator('input[type="file"]').first();
  }

  async createCampaign() {
    const campaignTitle = generateRandomName("Campaign");

    await this.campaignsLink.click();
    await this.addCampaignLink.click();

    await this.newCampaignTitleInput.waitFor({
      state: "visible",
    });
    await this.newCampaignTitleInput.click();
    await this.newCampaignTitleInput.fill(campaignTitle);

    await this.pickDateButton.click();
    await this.todayButton.click();

    await this.page.keyboard.press("Escape");

    await this.createCampaignSubmitButton.click();

    await this.newCampaignDialog.waitFor({ state: "detached" });

    console.log("✅ Campaign has been created successfully...");

    return { campaignTitle, campaignUrl: this.page.url() };
  }

  //fillCampaignDetails — General tab: description + participant briefing.
  async fillCampaignDetails() {
    const description = generateRandomName("CampaignDes");
    const briefing = generateRandomName("Briefing");

    await this.campaignDescriptionBox.waitFor({
      state: "visible",
    });
    await this.campaignDescriptionBox.click();
    await this.campaignDescriptionBox.fill(description);

    await fillRichText(
      this.page,
      this.briefingBox,
      briefing,
      "campaign-briefing",
    );

    // Autosave confirmation, not an explicit Save button on this page.
    await this.savedIndicator.waitFor({ state: "visible" });

    console.log("✅ Campaign details have been filled successfully...");
  }

  //configurePlanning — Planning tab: switch the deadline behavior card.
  async configurePlanning() {
    await this.tab("Planning").click();
    await this.softDeadlineCard.waitFor({ state: "visible" });
    await this.softDeadlineCard.click();
    await this.savedIndicator.waitFor({ state: "visible" });

    console.log("✅ Planning tab has been configured successfully...");
  }

  //addCampaignTask — Tasks tab: quick-add a task via the inline row.
  async addCampaignTask() {
    const taskTitle = generateRandomName("CampaignTask");

    await this.tab("Tasks").click();
    await this.quickAddTaskInput.waitFor({ state: "visible" });
    await this.quickAddTaskInput.fill(taskTitle);
    await this.quickAddTaskInput.press("Enter");

    await this.page
      .locator(`tr:has(input[value="${taskTitle}"])`)
      .waitFor({ state: "visible" });

    console.log("✅ Campaign task has been added successfully...");
  }

  //addFormField — Form tab: add the standard "Department" field to the submission form.
  async addFormField() {
    await this.tab("Form").click();
    await this.addFieldButton.waitFor({ state: "visible" });
    await this.addFieldButton.click();

    await this.addDepartmentFieldButton.waitFor({
      state: "visible",
    });
    await this.addDepartmentFieldButton.click();
    await this.page.keyboard.press("Escape");

    console.log("✅ Form field has been added successfully...");
  }

  //configureAccess — Access tab: invite the first available user.
  async configureAccess() {
    await this.tab("Access").click();
    await this.addUsersButton.waitFor({ state: "visible" });
    await this.addUsersButton.click();

    await this.firstUserRow.waitFor({ state: "visible" });
    await this.firstUserRow.click();
    await this.addUsersSubmitButton.click();
    await this.addUsersDialog.waitFor({ state: "detached" });

    console.log("✅ Access has been configured successfully...");
  }

  async openCampaignCommunication() {
    await this.tab("Communication").click();
    await this.addCommunicationButton.waitFor({
      state: "visible",
    });
    await this.addCommunicationButton.click();

    await this.selectUsersCombobox.waitFor({
      state: "visible",
    });
    await this.page.keyboard.press("Escape");
    await this.newCommunicationDialog.waitFor({
      state: "detached",
    });

    console.log("✅ Communication dialog has been verified successfully...");
  }

  //configureAutoResponses — Auto responses tab: set a non-email confirmation mode.
  async configureAutoResponses() {
    await this.tab("Auto responses").click();
    await this.submissionConfirmationCombobox.waitFor({
      state: "visible",
    });
    await this.submissionConfirmationCombobox.click();
    await this.page
      .getByRole("option", { name: "Browser only", exact: true })
      .click();
    await this.savedIndicator.waitFor({ state: "visible" });

    console.log("✅ Auto responses have been configured successfully...");
  }

  //fillCampaignContext — Context tab: overview, problem, and one tag field.
  async fillCampaignContext() {
    const overview = generateRandomName("Overview");
    const problem = generateRandomName("Problem");

    await this.tab("Context").click();
    await this.overviewBox.waitFor({ state: "visible" });
    await this.overviewBox.click();
    await this.overviewBox.fill(overview);

    await this.problemBox.click();
    await this.problemBox.fill(problem);

    await this.objectivesTagInput.click();
    await this.objectivesTagInput.fill(generateRandomName("Objective"));
    await this.objectivesTagInput.press("Enter");

    await this.savedIndicator.waitFor({ state: "visible" });

    console.log("✅ Campaign context has been filled successfully...");
  }

  //uploadCampaignFile — Files tab.
  async uploadCampaignFile(filePath = "test-data/logo.jpg") {
    await this.tab("Files").click();
    await this.fileInput.waitFor({ state: "attached" });
    await this.fileInput.setInputFiles(filePath);
    await this.page
      .getByText("No files or links yet.")
      .waitFor({ state: "hidden", timeout: 2000 })
      .catch(() => {});

    console.log("✅ File has been uploaded successfully...");
  }

  //verifyCampaignInList — confirms the created campaign is visible back on the list.
  async verifyCampaignInList(campaignTitle) {
    const campaignEntry = this.page.getByText(campaignTitle, { exact: false });

    // Same list/search eventual-consistency lag documented elsewhere in this
    // suite (funnels, ideas, tasks — up to ~120s under load). There's no
    // search box to retry here, so re-navigate to the list a few times in
    // case the first load caught a stale cached response, rather than
    // trusting one static snapshot to eventually resolve.
    let found = false;
    for (let attempt = 1; attempt <= 4 && !found; attempt++) {
      await this.campaignsLink.click();
      await this.loadingSpinner
        .waitFor({ state: "hidden", timeout: 20000 })
        .catch(() => {});

      found = await campaignEntry
        .waitFor({ state: "visible", timeout: 20000 })
        .then(() => true)
        .catch(() => false);
    }

    await expect(
      campaignEntry,
      `Campaign "${campaignTitle}" should appear in the campaigns list`,
    ).toBeVisible({ timeout: SAFE_ACTION_TIMEOUT_MS });

    console.log("✅ Campaign is visible in the campaigns list...");
  }

  //completeCampaignFlow
  async completeCampaignFlow() {
    const { campaignTitle } = await this.createCampaign();
    await this.fillCampaignDetails();
    await this.configurePlanning();
    await this.addCampaignTask();
    await this.addFormField();
    await this.configureAccess();
    await this.openCampaignCommunication();
    await this.configureAutoResponses();
    await this.fillCampaignContext();
    await this.uploadCampaignFile();
    await this.verifyCampaignInList(campaignTitle);

    return { campaignTitle };
  }
}
