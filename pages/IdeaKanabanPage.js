import { expect } from "@playwright/test";
import { SAFE_ACTION_TIMEOUT_MS } from "../fixtures/rateLimitFixture";

export class KanbanPage {
  constructor(page) {
    this.page = page;
    this.ideaStatusDropdown = page
      .getByRole("combobox")
      .filter({ hasText: /Submitted|Active|Review|Planned/ })
      .first();
    this.ideaDropdownItem = page.getByRole("option", { name: "Active" });
    this.ideaBtn = page.getByRole("button", { name: "Ideas" });
    this.ideaCard = page.getByRole("link").filter({ hasText: /^$/ }); // Hover target
    this.ideaCheckBox = page.getByRole("checkbox");
    this.ideaActiveDropdown = page.getByRole("button", { name: "Actions" });
    this.ideaMoveToLane = page.getByRole("menuitem", { name: "Move to lane" });
    this.ideaCombobox = page.getByRole("combobox");
    this.ideaSuggestions = page
      .getByLabel("Suggestions")
      .getByText("Review idea");
    this.ideaMove = page.getByRole("button", { name: "Move" });

    // Drag and drop (dynamic)
    this.ideaCardByTitle = (itemTitle) =>
      page.getByText(itemTitle, { exact: false }).first();
    this.laneByName = (laneName) =>
      page
        .locator("div")
        .filter({ hasText: new RegExp(`^${laneName}`) })
        .and(page.locator(".bg-gray-100"))
        .first();
  }

  getCenterCoords(box) {
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
  }

  async dragIdeaToLane(itemTitle, targetLaneName) {
    const sourceCard = this.ideaCardByTitle(itemTitle);
    const targetLane = this.laneByName(targetLaneName);

    await expect(sourceCard, `Idea card "${itemTitle}" should be visible before dragging`).toBeVisible();
            await expect(targetLane, `Target lane "${targetLaneName}" should be visible before dragging`).toBeVisible();
    await targetLane.scrollIntoViewIfNeeded();

    const { x: sourceX, y: sourceY } = this.getCenterCoords(
      await sourceCard.boundingBox(),
    );
    const { x: targetX, y: targetY } = this.getCenterCoords(
      await targetLane.boundingBox(),
    );

    await this.page.mouse.move(sourceX, sourceY, { steps: 10 });
    await this.page.mouse.down();
    await this.page.waitForTimeout(700); // dnd-kit needs this pause to register drag start
    await this.page.mouse.move(targetX, targetY, { steps: 30 });
    await this.page.waitForTimeout(500);
    await this.page.mouse.up();

    await targetLane
      .getByText(itemTitle, { exact: false })
      .waitFor({ state: "visible" });
  }

  async moveIdeaToStage1(itemTitle) {
    const lanes = [
      "Review idea",
      "Create proposal",
      "Approved proposal",
      "Denied proposal",
    ];
    for (const lane of lanes) {
      console.log(`➡️  Moving "${itemTitle}" to "${lane}"...`);
      await this.dragIdeaToLane(itemTitle, lane);
      console.log(`✅ Idea has been moved to "${lane}" successfully...`);
      await this.page.waitForTimeout(1000); // let the board settle before the next drag
    }
  }
}
