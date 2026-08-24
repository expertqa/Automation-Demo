import {
  test,
  expect,
  RATE_LIMIT_TIME_BUDGET_MS,
} from "../fixtures/rateLimitFixture";

import { FunnelPage } from "../pages/FunnelPage";
import { IdeaPage } from "../pages/IdeaPage";
import { KanbanPage } from "../pages/IdeaKanabanPage.js";

test("TC-02 — Funnel, Idea & Kanban", async ({ page }) => {
  test.setTimeout(
    process.env.CI
      ? 240000 + RATE_LIMIT_TIME_BUDGET_MS
      : 180000 + RATE_LIMIT_TIME_BUDGET_MS,
  );

  const funnelPage = new FunnelPage(page);
  const ideaPage = new IdeaPage(page);
  const kanbanPage = new KanbanPage(page);

  await page.goto("/");

  let ideaTitle;

  await test.step("TC-02.1 Create a new idea funnel", async () => {
    const { funnelName } = await funnelPage.createFunnel();

    expect(
      funnelName,
      "createFunnel() should return the funnel name it used",
    ).toBeTruthy();
    await expect(page, "Should land on the funnel's Kanban view").toHaveURL(
      /\/studio\/funnels\/\d+\?view=kanban/,
    );
  });

  await test.step("TC-02.2 Create an idea inside the funnel", async () => {
    ({ ideaName: ideaTitle } = await ideaPage.createIdea());

    expect(
      ideaTitle,
      "createIdea() should return the idea name it used",
    ).toBeTruthy();
  });

  await test.step("TC-02.3 Fill Details Section in idea detail flow", async () => {
    await ideaPage.fillDetailsSection();
  });

  await test.step("TC-02.4 Add Task in idea detail flow", async () => {
    await ideaPage.addTask();
  });

  await test.step("TC-02.5 Publish Canvas in idea flow", async () => {
    await ideaPage.publishCanvas();
  });

  await test.step("TC-02.6 Add Problem in idea flow", async () => {
    await ideaPage.addProblem();
  });

  await test.step("TC-02.7 Add Assumption in idea flow", async () => {
    await ideaPage.addAssumption();
  });

  await test.step("TC-02.8 Add Experiment in idea flow", async () => {
    await ideaPage.addExperiment();
  });

  await test.step("TC-02.9 Add Risk in idea flow", async () => {
    await ideaPage.addRisk();
  });

  await test.step("TC-02.10 Add Decision in idea flow", async () => {
    await ideaPage.addDecision();
  });

  await test.step("TC-02.11 Add Lesson in idea flow", async () => {
    await ideaPage.addLesson();
  });

  await test.step("TC-02.12 Add Comment in idea flow", async () => {
    await ideaPage.addComment();
  });

  await test.step("TC-02.13 Add Team Member in idea flow", async () => {
    await ideaPage.addTeamMember();
  });

  await test.step("TC-02.14 Add Link in idea flow", async () => {
    await ideaPage.addLink();
  });

  await test.step("TC-02.15 Move idea through Kanban stages", async () => {
    await kanbanPage.moveIdeaToStage1(ideaTitle, "2. Review idea");

    // moveIdeaToStage1() already waits for the card inside each intermediate
    // lane as it goes, but this confirms the idea ended up in the correct
    // *final* lane ("Denied proposal") rather than just having moved somewhere.
    const finalLane = kanbanPage.laneByName("Denied proposal");
    await expect(
      finalLane.getByText(ideaTitle, { exact: false }),
      'Idea should be in the final "Denied proposal" lane',
    ).toBeVisible();
  });
});

test("Create funnel", async ({ page }, testInfo) => {
  console.log(`🔄 Retry number: ${testInfo.retry}`);
  // ...
});
