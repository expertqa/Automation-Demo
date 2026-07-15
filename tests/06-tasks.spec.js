import { test, expect } from '@playwright/test';

import { TasksPage } from '../pages/TasksPage';

test('Create, verify, filter and delete a task', async ({ page }) => {
  test.setTimeout(process.env.CI ? 180000 : 120000);

  const tasksPage = new TasksPage(page);

  await page.goto('/');

  let taskData;

  await test.step('Create a task with dates, status, time and description', async () => {
    taskData = await tasksPage.createTask();
  });

  await test.step('Reopen the task and verify saved field values', async () => {
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

  await test.step('Toggle "Show completed tasks"', async () => {
    const { checkedBefore, checkedAfter } = await tasksPage.toggleShowCompletedTasks();
    expect(checkedAfter).not.toBe(checkedBefore);
  });

  await test.step('Quick-add a task from the inline row', async () => {
    const quickTitle = `Quick-${Date.now()}`;
    await tasksPage.quickAddTask(quickTitle);
    await tasksPage.deleteTask(quickTitle);
  });

  await test.step('Delete the original task', async () => {
    await tasksPage.deleteTask(taskData.title);
  });
});