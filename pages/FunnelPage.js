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

    // The app now autosaves this page (confirmed live: no "Save" button
    // exists at all anymore) — clicking "Create idea funnel" immediately
    // creates a draft funnel and lands on its full settings page, and typing
    // the title triggers autosave via this status control, which cycles
    // "Saving..." -> "Saved" -> disappears within a few seconds.
    this.savingStatus = page
      .locator("button")
      .filter({ hasText: /Saving|Saved/i })
      .last();
  }

  async createFunnel() {
    const funnelName = generateRandomName("Funnel");
    const duplicateToast = this.page.getByText(/already exists/i);

    await this.toolsButton.click();
    await this.funnelsLink.click();
    await this.createIdeaFunnelLink.waitFor({ state: "visible" });

    let created = false;
    for (let attempt = 1; attempt <= 3 && !created; attempt++) {
      await this.createIdeaFunnelLink.click();

      const outcome = await Promise.race([
        duplicateToast
          .waitFor({ state: "visible" })
          .then(() => "duplicate")
          .catch(() => null),
        this.funnelTitleInput
          .waitFor({ state: "visible" })
          .then(() => "created")
          .catch(() => null),
      ]);

      if (outcome === "created") {
        created = true;
      } else if (outcome === "duplicate") {
        console.log(
          `⚠️ Draft funnel default title collided (attempt ${attempt}/3) — retrying...`,
        );
        await this.funnelsLink.click();
        await this.createIdeaFunnelLink.waitFor({ state: "visible" });
      } else {
        throw new Error(
          `Funnel draft creation: neither the duplicate toast nor the title input appeared within 30s (attempt ${attempt}/3).`,
        );
      }
    }

    if (!created) {
      throw new Error(
        "Failed to create a funnel draft after 3 attempts — repeated default-title collisions.",
      );
    }

    await this.funnelTitleInput.fill(funnelName);

    await expect(this.savingStatus)
      .not.toHaveText("Saving...", { timeout: SAFE_ACTION_TIMEOUT_MS })
      .catch(() => {});

    await this.page.safeWaitForURL(
      /\/studio\/funnels\/\d+\?view=kanban/,
      () => this.viewIdeasLink.click({ timeout: SAFE_ACTION_TIMEOUT_MS }),
      { timeout: SAFE_ACTION_TIMEOUT_MS },
    );

    console.log("✅ Funnel has been created successfully...");

    return { funnelName, funnelUrl: this.page.url() };
  }
}
