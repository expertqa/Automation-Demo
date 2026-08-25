import { expect } from "@playwright/test";
import { generateRandomName } from "../utils/helper.js";
import { IdeaPage } from "./IdeaPage";
import { SAFE_ACTION_TIMEOUT_MS } from "../fixtures/rateLimitFixture";

export class FunnelPage {
  constructor(page) {
    this.page = page;

    this.toolsButton = page.getByRole("button", {
      name: "Tools",
    });

    this.funnelsLink = page.getByRole("link", {
      name: "Funnels",
      exact: true,
    });

    this.createIdeaFunnelLink = page.getByRole("link", {
      name: "Create idea funnel",
    });

    this.funnelTitleInput = page.getByRole("textbox", {
      name: "Example: Service improvement",
    });

    this.viewIdeasLink = page.getByRole("link", {
      name: "View Ideas",
    });

    this.savingStatus = page
      .locator("button")
      .filter({ hasText: /Saving|Saved/i })
      .last();
  }

  async createFunnel() {
  const funnelName = generateRandomName('Funnel');

  await this.toolsButton.click();
  await this.funnelsLink.click();
  await expect(this.createIdeaFunnelLink, '"Create idea funnel" link should be visible').toBeVisible({ timeout: 30000 });


  const unauthorizedHeading = this.page.getByRole('heading', { name: 'You are Unauthorized' });
  let funnelFormOpened = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    await this.createIdeaFunnelLink.click();

    const outcome = await Promise.race([
      this.funnelTitleInput.waitFor({ state: 'visible', timeout: 30000 }).then(() => 'form'),
      unauthorizedHeading.waitFor({ state: 'visible', timeout: 30000 }).then(() => 'unauthorized'),
    ]);

    if (outcome === 'form') {
      funnelFormOpened = true;
      break;
    }

    const duplicateTitle = await this.page.getByText(/funnel with title .* already exists/i).isVisible().catch(() => false);
    if (!duplicateTitle || attempt === 2) {
      throw new Error('Funnel creation was denied before its title form opened.');
    }

    await this.page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(this.createIdeaFunnelLink, 'Create idea funnel link should reappear after a duplicate-title rejection').toBeVisible({ timeout: 30000 });
    await this.page.waitForTimeout(61000);
  }

  if (!funnelFormOpened) {
    throw new Error('Funnel title form did not open.');
  }

  await this.funnelTitleInput.fill(funnelName, { timeout: 30000 });
  for (let attempt = 0; attempt < 3; attempt++) {
    await this.page.waitForTimeout(700);
    const currentValue = await this.funnelTitleInput.inputValue();
    if (currentValue === funnelName) break;
    await this.funnelTitleInput.fill(funnelName, { timeout: 30000 });
  }
  await expect(this.funnelTitleInput, 'Funnel title textbox should hold the name we just typed').toHaveValue(funnelName);

  await expect(this.savingStatus).not.toHaveText('Saving...', { timeout: 15000 }).catch(() => {});


  await Promise.all([
    this.page.waitForURL(/\/studio\/funnels\/\d+\?view=kanban/, { timeout: 30000, waitUntil: 'commit' }),
    this.viewIdeasLink.click({ timeout: 30000 }),
  ]);

  console.log('✅ Funnel has been created successfully...');

  return { funnelName, funnelUrl: this.page.url() };
}
  }
