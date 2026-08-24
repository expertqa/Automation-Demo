import {
  test,
  expect,
  RATE_LIMIT_TIME_BUDGET_MS,
} from "../fixtures/rateLimitFixture";

import { CampaignPage } from "../pages/CampaignPage";

test("TC-07 — Campaign", async ({ page }) => {
  test.setTimeout(
    process.env.CI
      ? 240000 + RATE_LIMIT_TIME_BUDGET_MS
      : 180000 + RATE_LIMIT_TIME_BUDGET_MS,
  );

  const campaignPage = new CampaignPage(page);

  await page.goto("/");

  let campaignTitle;

  await test.step("TC-07.1 Create a new campaign", async () => {
    ({ campaignTitle } = await campaignPage.createCampaign());

    expect(
      campaignTitle,
      "createCampaign() should return the title it used",
    ).toBeTruthy();
    await expect(
      page,
      "Should land on the new campaign's manage page",
    ).toHaveURL(/\/studio\/campaign\/\d+/);
  });

  await test.step("TC-07.2 Fill campaign description and participant briefing", async () => {
    await campaignPage.fillCampaignDetails();
  });

  await test.step("TC-07.3 Configure Planning tab", async () => {
    await campaignPage.configurePlanning();
  });

  await test.step("TC-07.4 Add a task on the Tasks tab", async () => {
    await campaignPage.addCampaignTask();
  });

  await test.step("TC-07.5 Add a field on the Form tab", async () => {
    await campaignPage.addFormField();
  });

  await test.step("TC-07.6 Configure Access tab", async () => {
    await campaignPage.configureAccess();
  });

  await test.step("TC-07.7 Verify Communication dialog", async () => {
    await campaignPage.openCampaignCommunication();
  });

  await test.step("TC-07.8 Configure Auto responses tab", async () => {
    await campaignPage.configureAutoResponses();
  });

  await test.step("TC-07.9 Fill Context tab", async () => {
    await campaignPage.fillCampaignContext();
  });

  await test.step("TC-07.10 Upload a file on the Files tab", async () => {
    await campaignPage.uploadCampaignFile();
  });

  await test.step("TC-07.11 Verify campaign appears in the campaigns list", async () => {
    await campaignPage.verifyCampaignInList(campaignTitle);
    expect(campaignTitle).toBeTruthy();
  });
});

test("Create funnel", async ({ page }, testInfo) => {
  console.log(`🔄 Retry number: ${testInfo.retry}`);
  // ...
});
