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
  }


async createFunnel() {
  const funnelName = generateRandomName('Funnel');

  await this.toolsButton.click();
  await this.funnelsLink.click();
  await this.createIdeaFunnelLink.waitFor({ state: 'visible', timeout: 30000 });
  await this.createIdeaFunnelLink.click();

  await this.funnelTitleInput.waitFor({ state: 'visible', timeout: 30000 });
  await this.funnelTitleInput.fill(funnelName, { timeout: 30000 });
  await Promise.all([
    this.page.waitForURL(/\/studio\/funnels\/\d+\?view=kanban/, { timeout: 30000 }),
    this.viewIdeasLink.click({ timeout: 30000 }),
  ]);

  console.log('✅ Funnel has been created successfully...');

  return { funnelName, funnelUrl: this.page.url() };
}

}