import { expect } from "@playwright/test";
import { generateRandomName, fillRichText } from "../utils/helper.js";
import { SAFE_ACTION_TIMEOUT_MS } from "../fixtures/rateLimitFixture";

export class TasksPage {
  constructor(page) {
    this.page = page;

    // Navigation
    this.tasksLink = page.getByRole("link", { name: "Tasks" }).first();

    // Toolbar
    this.addTaskButton = page.getByRole("button", { name: "Add task" }).first();
    this.filterButton = page.getByRole("button", { name: "Filter" });

    // Filter panel
    this.ownerFilterCombobox = page
      .getByRole("combobox")
      .filter({ hasText: "Muhammad SQA Super Admin" })
      .first();
    this.searchTasksTextbox = page.getByPlaceholder("Search", { exact: true });
    this.showCompletedSwitch = page.getByRole("switch", {
      name: "Show completed tasks",
    });

    // Quick add row (inline "New task" row at the bottom of the list)
    this.quickAddTitleTextbox = page.getByPlaceholder(
      "Enter title and hit enter",
    );

    // Add/Edit task modal
    this.taskModal = page
      .locator('[role="dialog"]')
      .filter({ has: page.locator("#task_title") });
    this.taskTitleInput = this.taskModal.locator("#task_title");
    this.taskPhaseInput = this.taskModal.locator("#task_phase");
    // Combobox order inside the modal is fixed: Owner, Status, Estimated hours,
    // Estimated minutes, Spent hours, Spent minutes.
    this.taskModalComboboxes = this.taskModal.getByRole("combobox");
    this.editTaskButton = (row) => row.locator('button[id^="edit-task-"]');
    // Anchored to the field's own label ("Start date"/"Due date"), not the
    // button's own text — the button text changes to the picked date once
    // set, which would make a text-based locator on "Pick a date" go stale
    // right after the action we need to then verify. The label never
    // changes, so this locator stays valid before and after picking, and
    // isn't affected by other fields being added/reordered elsewhere in the
    // modal (unlike a position-based index across all trigger buttons).
    this.taskStartDateButton = this.taskModal
      .locator(".field")
      .filter({ hasText: "Start date" })
      .getByRole("button");
    this.taskDueDateButton = this.taskModal
      .locator(".field")
      .filter({ hasText: "Due date" })
      .getByRole("button");
    this.taskDescriptionFrame = this.taskModal.locator(
      '[contenteditable="true"]',
    );
    this.saveTaskButton = this.taskModal.getByRole("button", {
      name: "Add task",
      exact: true,
    });
    this.closeModalButton = this.taskModal.getByRole("button", {
      name: "Close",
    });
    this.deleteTaskButton = this.taskModal.getByRole("button", {
      name: "Delete",
      exact: true,
    });
    this.closeTaskModalButton = this.taskModal.getByRole("button", {
      name: "Close",
    });

    // Date picker popup
    this.calendarPopup = page.locator('[role="dialog"][data-side]');

    // Dynamic row lookup (title is stored in an input's value attribute, not text content)
    this.taskRowByTitle = (title) =>
      page.locator(`tr:has(input[value="${title}"])`);
  }

  //navigateToTasks
  async navigateToTasks() {
    await this.tasksLink.click();
    await expect(
      this.addTaskButton,
      "Tasks page should finish loading and show the Add task button",
    ).toBeVisible({ timeout: SAFE_ACTION_TIMEOUT_MS });

    console.log("✅ Tasks page has been loaded successfully...");
  }

  //openAddTaskModal
  async openAddTaskModal() {
    await this.addTaskButton.click();
    await expect(this.taskModal, "Add task modal should open").toBeVisible({
      timeout: SAFE_ACTION_TIMEOUT_MS,
    });
  }

  //pickDate
  async pickDate(pickerIndex) {
    const dateButton =
      pickerIndex === 0 ? this.taskStartDateButton : this.taskDueDateButton;
    await dateButton.click();

    await expect(
      this.calendarPopup,
      "Date picker calendar should open",
    ).toBeVisible({ timeout: SAFE_ACTION_TIMEOUT_MS });

    const today = await this.page.evaluate(() =>
      new Date().getDate().toString(),
    );
    await this.calendarPopup
      .getByRole("gridcell", { name: today, exact: true })
      .first()
      .click();

    await this.page.keyboard.press("Escape");

    // The button's placeholder text ("Pick a date") is replaced by the chosen
    // date once selection registers — confirms the click actually set a date
    // rather than silently missing the gridcell. `dateButton` stays valid
    // here since it's anchored to the field's label, not its own text.
    await expect(
      dateButton,
      "Date button should no longer show the placeholder after picking a date",
    ).not.toHaveText("Pick a date");
  }

  //setStatus
  async setStatus(status) {
    await this.taskModalComboboxes.nth(1).click();
    await this.page.getByRole("option", { name: status, exact: true }).click();

    await expect(
      this.taskModalComboboxes.nth(1),
      `Status combobox should reflect "${status}" after selection`,
    ).toHaveText(status);
  }

  //setTime
  async setTime(type, hours, minutes) {
    if (minutes % 5 !== 0) {
      throw new Error("Minutes must be a multiple of 5");
    }

    const formattedMinutes = minutes.toString().padStart(2, "0");
    const hourComboIndex = type === "estimated" ? 2 : 4;
    const minuteComboIndex = type === "estimated" ? 3 : 5;

    await this.taskModalComboboxes.nth(hourComboIndex).click();
    await this.page
      .getByRole("option", { name: hours.toString(), exact: true })
      .click();

    await this.taskModalComboboxes.nth(minuteComboIndex).click();
    await this.page
      .getByRole("option", { name: formattedMinutes, exact: true })
      .click();
  }

  //fillDescription
  async fillDescription(text) {
    await fillRichText(
      this.page,
      this.taskDescriptionFrame,
      text,
      "task-description",
    );

    await expect(
      this.taskDescriptionFrame,
      "Description editor should contain the text just typed",
    ).toContainText(text);
  }

  //saveTask
  async saveTask() {
    await this.saveTaskButton.click();
    await this.closeTaskModalButton.click();

    await expect(
      this.taskModal,
      "Task modal should close after saving",
    ).toBeHidden({ timeout: SAFE_ACTION_TIMEOUT_MS });
  }

  //createTask
  async createTask() {
    const title = generateRandomName("Task");
    const phase = generateRandomName("Phase");
    const description = generateRandomName("Description");

    const taskData = {
      title,
      phase,
      status: "Completed",
      estimatedHours: "2",
      estimatedMinutes: "30",
      spentHours: "1",
      spentMinutes: "45",
      description,
    };

    await this.navigateToTasks();
    await this.openAddTaskModal();

    await this.taskTitleInput.fill(title);
    await this.taskPhaseInput.fill(phase);

    await expect(
      this.taskTitleInput,
      "Title field should hold the value just typed",
    ).toHaveValue(title);
    await expect(
      this.taskPhaseInput,
      "Phase field should hold the value just typed",
    ).toHaveValue(phase);

    await this.pickDate(1); // Due date
    await this.setStatus(taskData.status);
    await this.pickDate(0); // Start date

    await this.setTime("estimated", 2, 30);
    await this.setTime("spent", 1, 45);
    await this.fillDescription(description);

    await this.saveTask();

    console.log("✅ Task has been created successfully...");

    return taskData;
  }

  //openTaskByTitle
  async openTaskByTitle(title) {
    await this.openFilterPanel();
    if (
      (await this.showCompletedSwitch.getAttribute("aria-checked")) !== "true"
    ) {
      await this.showCompletedSwitch.click();
    }

    await this.searchTasks(title);

    const row = this.taskRowByTitle(title);
    // waitFor() actually polls, unlike isVisible({ timeout }) which checks once.
    let found = await row
      .waitFor({ state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    for (let attempt = 1; attempt <= 2 && !found; attempt++) {
      await this.searchTasksTextbox.fill("");
      await this.searchTasks(title);
      found = await row
        .waitFor({ state: "visible", timeout: 30000 })
        .then(() => true)
        .catch(() => false);
    }

    await expect(
      row,
      `Task row for "${title}" should appear after searching`,
    ).toBeVisible({ timeout: SAFE_ACTION_TIMEOUT_MS });

    const editButton = this.editTaskButton(row);

    let modalOpened = false;
    for (let attempt = 1; attempt <= 3 && !modalOpened; attempt++) {
      try {
        await editButton.click({ timeout: 15000 });
        modalOpened = await this.taskModal
          .waitFor({ state: "visible", timeout: 10000 })
          .then(() => true)
          .catch(() => false);
      } catch {
        // click itself didn't land (e.g. row re-rendered mid-click after the
        // preceding delete's list refresh) — re-resolve and try again
      }
    }

    await expect(
      this.taskModal,
      "Task modal should open after clicking edit",
    ).toBeVisible({ timeout: SAFE_ACTION_TIMEOUT_MS });
  }

  //getTaskFieldValues
  async getTaskFieldValues() {
    return this.taskModal.evaluate((el) => ({
      title: el.querySelector("#task_title")?.value,
      phase: el.querySelector("#task_phase")?.value,
      estimatedHours: el.querySelector("#task_estimated_time_hours")?.value,
      estimatedMinutes: el.querySelector("#task_estimated_time_mins")?.value,
      spentHours: el.querySelector("#task_spent_time_hours")?.value,
      spentMinutes: el.querySelector("#task_spent_time_mins")?.value,
    }));
  }

  //getTaskDescriptionText
  async getTaskDescriptionText() {
    return this.taskDescriptionFrame.textContent();
  }

  //closeTaskModal
  async closeTaskModal() {
    // If modal is not visible, assume it's already closed
    const isVisible = await this.taskModal
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (!isVisible) {
      return;
    }

    await this.closeTaskModalButton.click();
    await expect(this.taskModal, "Task modal should close").toBeHidden({
      timeout: SAFE_ACTION_TIMEOUT_MS,
    });
  }

  //deleteTask
  async deleteTask(title) {
    await this.openTaskByTitle(title);

    this.page.once("dialog", (dialog) => dialog.accept());
    await this.deleteTaskButton.click();

    await expect(
      this.taskRowByTitle(title),
      `Task row for "${title}" should be removed after deletion`,
    ).not.toBeAttached({ timeout: SAFE_ACTION_TIMEOUT_MS });

    console.log("✅ Task has been deleted successfully...");
  }

  //openFilterPanel
  async openFilterPanel() {
    // Check if panel is already open (switch visible)
    const panelOpen = await this.showCompletedSwitch
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    if (panelOpen) return;

    // Click the filter button (auto‑waits for visibility)
    await this.filterButton.click();

    // Wait for the panel to open
    await expect(
      this.showCompletedSwitch,
      "Filter panel should open",
    ).toBeVisible({ timeout: SAFE_ACTION_TIMEOUT_MS });
  }

  //toggleShowCompletedTasks
  async toggleShowCompletedTasks() {
    await this.openFilterPanel();

    const checkedBefore =
      await this.showCompletedSwitch.getAttribute("aria-checked");
    await this.showCompletedSwitch.click();
    const checkedAfter =
      await this.showCompletedSwitch.getAttribute("aria-checked");

    console.log('✅ "Show completed tasks" has been toggled successfully...');

    return { checkedBefore, checkedAfter };
  }

  //searchTasks
  async searchTasks(query) {
    await this.searchTasksTextbox.fill(query);

    await expect(
      this.searchTasksTextbox,
      "Search box should hold the typed query",
    ).toHaveValue(query);

    console.log("✅ Tasks have been searched successfully...");
  }

  //filterByOwner
  async filterByOwner(ownerName) {
    await this.openFilterPanel();
    await this.ownerFilterCombobox.click();
    await this.page
      .getByRole("option", { name: ownerName, exact: true })
      .click();

    await expect(
      this.page.getByRole("combobox").filter({ hasText: ownerName }),
      `Owner filter should reflect "${ownerName}"`,
    ).toBeVisible();

    console.log("✅ Tasks have been filtered by owner successfully...");
  }

  //quickAddTask
  async quickAddTask(title) {
    // Guard against a stale search filter left over from a previous step
    // (e.g. openTaskByTitle() searching for a different task) — a leftover
    // filter would hide the newly added row even though creation succeeded.
    await this.searchTasksTextbox.fill("");
    await expect(
      this.searchTasksTextbox,
      "Search filter should be cleared before quick-adding",
    ).toHaveValue("");

    await this.quickAddTitleTextbox.fill(title);
    await this.quickAddTitleTextbox.press("Enter");

    // Quick-added rows can lag list/index updates the same way search does
    // elsewhere in this suite (documented up to ~120s under load) — a single
    // creation action, so widen the wait rather than retry the submission,
    // which would risk creating a duplicate task.
    await expect(
      this.taskRowByTitle(title),
      `Quick-added task row for "${title}" should appear`,
    ).toBeVisible({ timeout: SAFE_ACTION_TIMEOUT_MS });

    console.log("✅ Task has been quick-added successfully...");
  }
}
