import { chromium } from '@playwright/test';
import { LoginPage } from './pages/LoginPage.js';
import users from './data/users.json' with { type: 'json' };
import config from './config/qa.json' with { type: 'json' };

export default async function globalSetup(playwrightConfig) {
  const { baseURL } = playwrightConfig.projects[0].use;

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  const login = new LoginPage(page);

  await page.goto(config.paths.login);
  await login.login(users.user.email, users.user.password);

  await context.storageState({ path: 'state.json' });
  await browser.close();
}
