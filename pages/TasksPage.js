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
    // Combobox order inside the modal is fixed: Owner, Status, Estimated hours,
    // Estimated minutes, Spent hours, Spent minutes.
    this.taskModalComboboxes = this.taskModal.getByRole('combobox');
    this.taskStartDateButton = this.taskModal.getByText('Pick a date').first();
    this.taskDueDateButton = this.taskModal.getByText('Pick a date').nth(1);
    this.taskDescriptionFrame = this.taskModal.locator('[contenteditable="true"]');
    this.saveTaskButton = this.taskModal.getByRole('button', { name: 'Add task', exact: true });
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
    await this.addTaskButton.waitFor({ state: 'visible', timeout: 30000 });

    console.log('✅ Tasks page has been loaded successfully...');
  }

  //openAddTaskModal
  async openAddTaskModal() {
    await this.addTaskButton.click();
    await this.taskModal.waitFor({ state: 'visible', timeout: 10000 });
  }

  //pickDate
  async pickDate(pickerIndex) {
    const dateButton = pickerIndex === 0 ? this.taskStartDateButton : this.taskDueDateButton;
    await dateButton.click();

    await this.calendarPopup.waitFor({ state: 'visible', timeout: 5000 });
    const today = new Date().getDate().toString();
    await this.calendarPopup.getByRole('gridcell', { name: today, exact: true }).first().click();

    await this.page.keyboard.press('Escape');
  }

  //setStatus
  async setStatus(status) {
    await this.taskModalComboboxes.nth(1).click();
    await this.page.getByRole('option', { name: status, exact: true }).click();
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
  }

  //saveTask
  async saveTask() {
    await this.saveTaskButton.click();
    await this.taskModal.waitFor({ state: 'hidden', timeout: 10000 });
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
    // Completed tasks are hidden from the list/search by default; enable the
    // toggle first so a task with status "Completed" can actually be found.
    await this.openFilterPanel();
    if ((await this.showCompletedSwitch.getAttribute('aria-checked')) !== 'true') {
      await this.showCompletedSwitch.click();
    }

    // The list groups/virtualizes rows, so a task outside the default view
    // (e.g. one with a due date) won't be in the DOM until it's searched for.
    await this.searchTasks(title);

    const row = this.taskRowByTitle(title);
    await row.waitFor({ state: 'visible', timeout: 30000 });

    const editButton = row.locator('button svg').last();
    await editButton.click();

    await this.taskModal.waitFor({ state: 'visible', timeout: 10000 });
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
  async closeTaskModal() {
    await this.closeTaskModalButton.click();
    await this.taskModal.waitFor({ state: 'hidden', timeout: 10000 });
  }

  //deleteTask
  async deleteTask(title) {
    await this.openTaskByTitle(title);

    this.page.once('dialog', (dialog) => dialog.accept());
    await this.deleteTaskButton.click();

    await this.taskRowByTitle(title).waitFor({ state: 'detached', timeout: 10000 });

    console.log('✅ Task has been deleted successfully...');
  }

  //openFilterPanel
  async openFilterPanel() {
    const alreadyOpen = await this.showCompletedSwitch.isVisible().catch(() => false);
    if (alreadyOpen) return;

    await this.filterButton.click();
    await this.showCompletedSwitch.waitFor({ state: 'visible', timeout: 10000 });
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
    await this.openFilterPanel();
    await this.searchTasksTextbox.fill(query);
    await this.page.waitForTimeout(5000); // search filter has a multi-second lag before applying

    console.log('✅ Tasks have been searched successfully...');
  }

  //filterByOwner
  async filterByOwner(ownerName) {
    await this.openFilterPanel();
    await this.ownerFilterCombobox.click();
    await this.page.getByRole('option', { name: ownerName, exact: true }).click();

    console.log('✅ Tasks have been filtered by owner successfully...');
  }

  //quickAddTask
  async quickAddTask(title) {
    await this.quickAddTitleTextbox.fill(title);
    await this.quickAddTitleTextbox.press('Enter');

    await this.taskRowByTitle(title).waitFor({ state: 'visible', timeout: 10000 });

    console.log('✅ Task has been quick-added successfully...');
  }
}