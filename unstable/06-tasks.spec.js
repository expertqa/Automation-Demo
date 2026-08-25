import { test, expect } from '@playwright/test';

import { TasksPage } from '../pages/TasksPage';

test('TC-06 — Tasks', async ({ page }) => {
  
  test.setTimeout(360000);

  const tasksPage = new TasksPage(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  let taskData;

  await test.step('TC-06.1 Create a task with full field set', async () => {
    taskData = await tasksPage.createTask();

    expect(taskData.title, 'Created task should have a title').toBeTruthy();
    expect(taskData.phase, 'Created task should have a phase').toBeTruthy();
  });

  await test.step('TC-06.2 Reopen task and verify saved values', async () => {
    await tasksPage.openTaskByTitle(taskData.title);
    const fieldValues = await tasksPage.getTaskFieldValues();

    expect(fieldValues.title).toBe(taskData.title);
    expect(fieldValues.phase).toBe(taskData.phase);
    expect(fieldValues.estimatedHours).toBe(taskData.estimatedHours);
    expect(fieldValues.estimatedMinutes).toBe(taskData.estimatedMinutes);
    expect(fieldValues.spentHours).toBe(taskData.spentHours);
    expect(fieldValues.spentMinutes).toBe(taskData.spentMinutes);

    const descriptionText = await tasksPage.getTaskDescriptionText();
    expect(descriptionText).toContain(taskData.description);

    await tasksPage.closeTaskModal();
  });

  await test.step('TC-06.3 Toggle "Show completed tasks"', async () => {
    const { checkedBefore, checkedAfter } = await tasksPage.toggleShowCompletedTasks();
    expect(checkedAfter).not.toBe(checkedBefore);
  });

  await test.step('TC-06.4 – TC-06.5 Quick-add and delete a task', async () => {
    const quickTitle = `Quick-${Date.now()}`;

    await tasksPage.quickAddTask(quickTitle);
    await expect(tasksPage.taskRowByTitle(quickTitle), 'Quick-added task should appear in the list').toBeVisible();

    await tasksPage.deleteTask(quickTitle);
    await expect(tasksPage.taskRowByTitle(quickTitle), 'Quick-added task should be gone after deletion').not.toBeAttached();
  });

  await test.step('TC-06.5 Delete the original task', async () => {
    await tasksPage.deleteTask(taskData.title);

    await expect(tasksPage.taskRowByTitle(taskData.title), 'Original task should be gone after deletion').not.toBeAttached();
  });
});

test('Create funnel', async ({ page }, testInfo) => {
  console.log(`🔄 Retry number: ${testInfo.retry}`);
  // ...
});
