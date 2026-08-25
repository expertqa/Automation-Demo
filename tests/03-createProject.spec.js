import {
  test,
  expect,
  RATE_LIMIT_TIME_BUDGET_MS,
} from "../fixtures/rateLimitFixture";
import { SAFE_ACTION_TIMEOUT_MS } from "../fixtures/rateLimitFixture";

import { ProjectPage } from "../pages/ProjectPage";

test("TC-03 — Project", async ({ page }) => {
  test.setTimeout(
    process.env.CI
      ? 240000 + RATE_LIMIT_TIME_BUDGET_MS
      : 180000 + RATE_LIMIT_TIME_BUDGET_MS,
  );

  const projectPage = new ProjectPage(page);

  await page.goto("/");

  let projectTitle;

  await test.step("TC-03.1 Create a new project", async () => {
    ({ projectTitle } = await projectPage.createProject());

    expect(
      projectTitle,
      "createProject() should return the title it used",
    ).toBeTruthy();
  });

  await test.step("TC-03.2 – TC-03.4 Tags, full detail flow & Activities tab", async () => {
    await projectPage.completeProjectFlow();

    await expect(
      page,
      "Should still be on the project detail page after the full flow",
    ).toHaveURL(/\/studio\/projects?\//i);
  });

  await test.step("TC-03.5 Open created project from list", async () => {
    await projectPage.projectsButton.click();

    await projectPage.searchProjectsTextbox.fill(projectTitle);

    const projectLink = page.getByRole("link", { name: projectTitle }).first();
    await expect(
      projectLink,
      "Newly created project should appear in the projects list once searched",
    ).toBeVisible({ timeout: SAFE_ACTION_TIMEOUT_MS });
    await projectLink.click();

    const opened = await expect(
      page.getByText(projectTitle).first(),
      "Opened project should show the correct title",
    )
      .toBeVisible({ timeout: SAFE_ACTION_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);

    if (!opened) {
      console.log(
        "⚠️ Opening the project 404'd or failed to load on the first attempt — retrying once from the list.",
      );
      const landedOnBlankEntity = await page
        .getByText("Untitled", { exact: true })
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (landedOnBlankEntity) {
        console.log(
          "⚠️ Landed on a blank/untitled entity instead of the real project — closing it out.",
        );
        await page
          .getByRole("button", { name: "Close" })
          .click()
          .catch(() => {});
      }
      await projectPage.projectsButton.click({
        timeout: SAFE_ACTION_TIMEOUT_MS * 2,
      });
      await projectPage.searchProjectsTextbox.fill(projectTitle);
      await expect(
        projectLink,
        "Project should still appear in the list on retry",
      ).toBeVisible({ timeout: SAFE_ACTION_TIMEOUT_MS });
      await projectLink.click();
      await expect(
        page.getByText(projectTitle).first(),
        "Opened project should show the correct title after retry",
      ).toBeVisible({ timeout: SAFE_ACTION_TIMEOUT_MS });
    }
  });
});

test("Create funnel", async ({ page }, testInfo) => {
  console.log(`🔄 Retry number: ${testInfo.retry}`);
  // ...
});
