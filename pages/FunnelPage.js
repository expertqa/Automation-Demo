import { expect } from '@playwright/test';
import {generateRandomName} from '../utils/helper.js';
import { IdeaPage } from './IdeaPage';

export class FunnelPage {
  constructor(page) {
     this.page = page;

  this.toolsButton = page.getByRole('button', {
    name: 'Tools'
  });

  this.funnelsLink = page.getByRole('link', {
    name: 'Funnels',
    exact: true
  });

  this.createIdeaFunnelLink = page.getByRole('link', {
    name: 'Create idea funnel'
  });

  this.funnelTitleInput = page.getByRole('textbox', {
    name: 'Example: Service improvement'
  });

  this.viewIdeasLink = page.getByRole('link', {
    name: 'View Ideas'
  });

  // The app now autosaves this page (confirmed live: no "Save" button
  // exists at all anymore) — clicking "Create idea funnel" immediately
  // creates a draft funnel and lands on its full settings page, and typing
  // the title triggers autosave via this status control, which cycles
  // "Saving..." -> "Saved" -> disappears within a few seconds.
  this.savingStatus = page.locator('button').filter({ hasText: /Saving|Saved/i }).last();
  }


async createFunnel() {
  const funnelName = generateRandomName('Funnel');

  await this.toolsButton.click();
  await this.funnelsLink.click();
  await this.createIdeaFunnelLink.waitFor({ state: 'visible', timeout: 30000 });
  await this.createIdeaFunnelLink.click();

  await this.funnelTitleInput.waitFor({ state: 'visible', timeout: 30000 });
  await this.funnelTitleInput.fill(funnelName, { timeout: 30000 });

  // No manual Save step — this page autosaves. "View Ideas" navigating
  // before the title's autosave actually commits server-side is the same
  // failure mode the old manual-Save flow was guarding against (the funnel
  // then never becomes searchable elsewhere, e.g. as an automation rule's
  // trigger scope), so wait for the autosave status to leave "Saving..."
  // before moving on. Best-effort: the whole cycle can finish in a couple
  // of seconds, so it's fine if this never catches "Saving..." at all.
  await expect(this.savingStatus).not.toHaveText('Saving...', { timeout: 15000 }).catch(() => {});

  await Promise.all([
    this.page.waitForURL(/\/studio\/funnels\/\d+\?view=kanban/, { timeout: 30000 }),
    this.viewIdeasLink.click({ timeout: 30000 }),
  ]);

  console.log('✅ Funnel has been created successfully...');

  return { funnelName, funnelUrl: this.page.url() };
}

}
