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

  // This SPA keeps background connections open (chat widget, polling, etc.),
  // so the default 'load' event can hang well past 30s even though the login
  // form itself is interactive almost immediately — wait for DOM content only.
  await page.goto(config.paths.login, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await login.login(users.user.email, users.user.password);

  // Clicking "Sign in" resolves as soon as the click registers, not once the
  // session cookie is actually set — capture storageState too early and it
  // saves a pre-auth state, leaving every dependent test back on /login.
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60000 });

  await context.storageState({ path: 'state.json' });
  await browser.close();
}
