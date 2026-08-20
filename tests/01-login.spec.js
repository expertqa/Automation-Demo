import {test, expect} from '@playwright/test';
import {LoginPage} from '../pages/LoginPage';
import users from '../data/users.json' with {type: 'json'};
import config from '../config/qa.json' with {type: 'json'};

test.use({ storageState: { cookies: [], origins: [] } });

test('TC-01 — Login', async({page}) => {

    const login = new LoginPage(page);

    // This SPA keeps background connections open (chat widget, polling, etc.),
    // so the default 'load' event can hang well past 30s even though the login
    // form itself is interactive almost immediately — wait for DOM content only.
    await page.goto(config.paths.login, { waitUntil: 'domcontentloaded' });

    await test.step('TC-01.1 Login with empty email and password', async () => {
        await login.loginWithEmptyFields(
            users.emptyUser.email,
            users.emptyUser.password,
        );

        await expect(page, 'Empty credentials should be rejected — user stays on /login').toHaveURL(/\/login/);
    });

    await test.step('TC-01.2 Login with invalid credentials', async () => {
        await login.loginInvalidData(
            users.invalidUser.email,
            users.invalidUser.password,
        );

        await expect(page, 'Invalid credentials should be rejected — user stays on /login').toHaveURL(/\/login/);
        await expect(page.getByText('We could not sign you in'), 'An invalid-login error message should be shown').toBeVisible();
    });

    await test.step('TC-01.3 Login with valid credentials', async () => {
        await login.login(
            users.user.email,
            users.user.password
        );

        await expect(page, 'Valid credentials should log the user in and leave /login').not.toHaveURL(/\/login/);
    });

})

test('Create funnel', async ({ page }, testInfo) => {
  console.log(`🔄 Retry number: ${testInfo.retry}`);
  // ...
});
