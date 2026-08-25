import { expect } from '@playwright/test';
import { generateRandomName, fillRichText } from '../utils/helper.js';

export class TasksPage {
  constructor(page) {
    this.page = page;

    // Navigation
    this.tasksLink = page.getByRole('link', { name: 'Tasks' }).first();

    // Toolbar
    this.addTaskButton = page.getByRole('button', { name: 'Add task' }).first();
    this.filterButton = page.getByRole('button', { name: 'Filter' });

    // Filter panel
    this.ownerFilterCombobox = page.getByRole('combobox').filter({ hasText: 'Muhammad SQA Super Admin' }).first();
    this.searchTasksTextbox = page.getByPlaceholder('Search', { exact: true });
    this.showCompletedSwitch = page.getByRole('switch', { name: 'Show completed tasks' });

    // Quick add row (inline "New task" row at the bottom of the list)
    this.quickAddTitleTextbox = page.getByPlaceholder('Enter title and hit enter');

    // Add/Edit task modal
    this.taskModal = page.locator('[role="dialog"]').first();
    this.taskTitleInput = this.taskModal.locator('#task_title');
    this.taskPhaseInput = this.taskModal.locator('#task_phase');
    this.taskModalComboboxes = this.taskModal.getByRole('combobox');
    this.taskStartDateButton = this.taskModal.locator('.field').filter({ hasText: 'Start date' }).getByRole('button');
    this.taskDueDateButton = this.taskModal.locator('.field').filter({ hasText: 'Due date' }).getByRole('button');
    this.taskDescriptionFrame = this.taskModal.locator('[contenteditable="true"]');
    this.saveTaskButton = this.taskModal.getByRole('button', { name: 'Add task', exact: true });
    this.closeModalButton = this.taskModal.getByRole('button', { name: 'Close' });
    this.deleteTaskButton = this.taskModal.getByRole('button', { name: 'Delete', exact: true });
    this.closeTaskModalButton = this.taskModal.getByRole('button', { name: 'Close' });

    // Date picker popup
    this.calendarPopup = page.locator('[role="dialog"][data-side]');

    // Dynamic row lookup (title is stored in an input's value attribute, not text content)
    this.taskRowByTitle = (title) => page.locator(`tr:has(input[value="${title}"])`);
  }

  //navigateToTasks
  async navigateToTasks() {
    await this.tasksLink.click();
    await expect(this.addTaskButton, 'Tasks page should finish loading and show the Add task button').toBeVisible({ timeout: 30000 });

    console.log('✅ Tasks page has been loaded successfully...');
  }

  //openAddTaskModal
  async openAddTaskModal() {
    await this.addTaskButton.click();
    await expect(this.taskModal, 'Add task modal should open').toBeVisible({ timeout: 10000 });
  }

  //pickDate
  async pickDate(pickerIndex) {
    const dateButton = pickerIndex === 0 ? this.taskStartDateButton : this.taskDueDateButton;
    await dateButton.click();

    await expect(this.calendarPopup, 'Date picker calendar should open').toBeVisible({ timeout: 5000 });

    const today = await this.page.evaluate(() => new Date().getDate().toString());
    await this.calendarPopup.getByRole('gridcell', { name: today, exact: true }).first().click();

    await this.page.keyboard.press('Escape');

    await expect(dateButton, 'Date button should no longer show the placeholder after picking a date').not.toHaveText('Pick a date');
  }

  //setStatus
  async setStatus(status) {
    await this.taskModalComboboxes.nth(1).click();
    await this.page.getByRole('option', { name: status, exact: true }).click();

    await expect(this.taskModalComboboxes.nth(1), `Status combobox should reflect "${status}" after selection`).toHaveText(status);
  }

  //setTime
  async setTime(type, hours, minutes) {
    if (minutes % 5 !== 0) {
      throw new Error('Minutes must be a multiple of 5');
    }

    const formattedMinutes = minutes.toString().padStart(2, '0');
    const hourComboIndex = type === 'estimated' ? 2 : 4;
    const minuteComboIndex = type === 'estimated' ? 3 : 5;

    await this.taskModalComboboxes.nth(hourComboIndex).click();
    await this.page.getByRole('option', { name: hours.toString(), exact: true }).click();

    await this.taskModalComboboxes.nth(minuteComboIndex).click();
    await this.page.getByRole('option', { name: formattedMinutes, exact: true }).click();
  }

  //fillDescription
  async fillDescription(text) {
    await fillRichText(this.page, this.taskDescriptionFrame, text, 'task-description');

    await expect(this.taskDescriptionFrame, 'Description editor should contain the text just typed').toContainText(text);
  }

  //saveTask
  async saveTask() {
    await this.saveTaskButton.click();
    await this.closeTaskModal('Task modal should close after saving');
  }

  //createTask
  async createTask() {
    const title = generateRandomName('Task');
    const phase = generateRandomName('Phase');
    const description = generateRandomName('Description');

    const taskData = {
      title,
      phase,
      status: 'Completed',
      estimatedHours: '2',
      estimatedMinutes: '30',
      spentHours: '1',
      spentMinutes: '45',
      description,
    };

    await this.navigateToTasks();
    await this.openAddTaskModal();

    await this.taskTitleInput.fill(title);
    await this.taskPhaseInput.fill(phase);

    await expect(this.taskTitleInput, 'Title field should hold the value just typed').toHaveValue(title);
    await expect(this.taskPhaseInput, 'Phase field should hold the value just typed').toHaveValue(phase);

    await this.pickDate(1); // Due date
    await this.setStatus(taskData.status);
    await this.pickDate(0); // Start date

    await this.setTime('estimated', 2, 30);
    await this.setTime('spent', 1, 45);
    await this.fillDescription(description);

    await this.saveTask();

    console.log('✅ Task has been created successfully...');

    return taskData;
  }

  //openTaskByTitle
  async openTaskByTitle(title) {
    await this.openFilterPanel();
    if ((await this.showCompletedSwitch.getAttribute('aria-checked')) !== 'true') {
      await this.showCompletedSwitch.click();
    
      await expect(this.showCompletedSwitch, 'Show completed tasks should be enabled before searching for a completed task')
        .toHaveAttribute('aria-checked', 'true', { timeout: 10000 });
    }

    const row = await this.findTaskRowByTitle(title);

    const editButton = row.locator('button:has(svg)').last();
    await editButton.click();

    await expect(this.taskModal, 'Task modal should open after clicking edit').toBeVisible({ timeout: 10000 });
  }

  //getTaskFieldValues
  async getTaskFieldValues() {
    return this.taskModal.evaluate((el) => ({
      title: el.querySelector('#task_title')?.value,
      phase: el.querySelector('#task_phase')?.value,
      estimatedHours: el.querySelector('#task_estimated_time_hours')?.value,
      estimatedMinutes: el.querySelector('#task_estimated_time_mins')?.value,
      spentHours: el.querySelector('#task_spent_time_hours')?.value,
      spentMinutes: el.querySelector('#task_spent_time_mins')?.value,
    }));
  }

  //getTaskDescriptionText
  async getTaskDescriptionText() {
    return this.taskDescriptionFrame.textContent();
  }

  //closeTaskModal
  async closeTaskModal(closedMessage = 'Task modal should close') {
   
    const activeTaskModal = this.page.locator('[role="dialog"]').filter({ has: this.page.locator('#task_title') }).last();
    const closeButton = activeTaskModal.getByRole('button', { name: 'Close' });
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click({ force: true, timeout: 5000 }).catch(async (error) => {
       
        if (await activeTaskModal.isVisible().catch(() => false)) throw error;
      });
    }
    await expect(activeTaskModal, closedMessage).toBeHidden({ timeout: 10000 });
  }

  //deleteTask
  async deleteTask(title) {
    await this.openTaskByTitle(title);

    this.page.once('dialog', (dialog) => dialog.accept());
    await this.deleteTaskButton.click();

    const row = this.taskRowByTitle(title);
    try {
      await expect(row, `Task row for "${title}" should be removed after deletion`).not.toBeAttached({ timeout: 10000 });
    } catch (error) {
      // Same server-backed search lag documented in findTaskRowByTitle: the
      // list can keep showing a stale row after a successful delete until a
      // fresh query is issued. Reissue the search once before failing for real.
      await this.searchTasks('');
      await this.searchTasks(title);
      await expect(row, `Task row for "${title}" should be removed after deletion`).not.toBeAttached({ timeout: 15000 });
    }

    await this.page.waitForTimeout(2000);

    console.log('✅ Task has been deleted successfully...');
  }

  //openFilterPanel
  async openFilterPanel() {
    const alreadyOpen = await this.showCompletedSwitch.isVisible().catch(() => false);
    if (alreadyOpen) return;

    let lastClickError;
    for (let attempt = 1; attempt <= 3; attempt++) {
   
      if (attempt > 1) {
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      }

      const clicked = await this.filterButton
        .click({ force: true, timeout: 30000 })
        .then(() => true)
        .catch((error) => {
          lastClickError = error;
          return false;
        });
      if (!clicked) continue;

      const isLastAttempt = attempt === 3;
      const opened = await expect(this.showCompletedSwitch)
        .toBeVisible({ timeout: isLastAttempt ? 30000 : 15000 })
        .then(() => true)
        .catch((error) => {
          if (isLastAttempt) throw error;
          return false;
      });
      if (opened) return;
    }

    if (lastClickError) throw lastClickError;
    throw new Error('Filter panel did not open after three attempts.');
  }

  //toggleShowCompletedTasks
  async toggleShowCompletedTasks() {
    await this.openFilterPanel();

    const checkedBefore = await this.showCompletedSwitch.getAttribute('aria-checked');
    await this.showCompletedSwitch.click();
    const checkedAfter = await this.showCompletedSwitch.getAttribute('aria-checked');

    console.log('✅ "Show completed tasks" has been toggled successfully...');

    return { checkedBefore, checkedAfter };
  }

  //searchTasks
  async searchTasks(query) {
    await this.searchTasksTextbox.fill(query);

    await expect(this.searchTasksTextbox, 'Search box should hold the typed query').toHaveValue(query);

    console.log('✅ Tasks have been searched successfully...');
  }

  //findTaskRowByTitle
  async findTaskRowByTitle(title) {
    const row = this.taskRowByTitle(title);

    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.searchTasks(title);
      try {
        await expect(row, `Task row for "${title}" should appear after searching`).toBeVisible({ timeout: 30000 });
        return row;
      } catch (error) {
        if (attempt === 2) throw error;

        await this.searchTasks('');
        await expect(this.searchTasksTextbox, 'Search box should clear before retrying the task lookup').toHaveValue('');
      }
    }
  }

  //filterByOwner
  async filterByOwner(ownerName) {
    await this.openFilterPanel();
    await this.ownerFilterCombobox.click();
    await this.page.getByRole('option', { name: ownerName, exact: true }).click();

    await expect(this.page.getByRole('combobox').filter({ hasText: ownerName }), `Owner filter should reflect "${ownerName}"`).toBeVisible();

    console.log('✅ Tasks have been filtered by owner successfully...');
  }

  //quickAddTask
  async quickAddTask(title) {
    await this.quickAddTitleTextbox.fill(title);
    await this.quickAddTitleTextbox.press('Enter');


    await this.openFilterPanel();
    await this.findTaskRowByTitle(title);

    console.log('✅ Task has been quick-added successfully...');
  }
}
