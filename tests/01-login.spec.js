import {test} from '@playwright/test';
import {qase} from 'playwright-qase-reporter/playwright';
import {LoginPage} from '../pages/LoginPage';
import users from '../data/users.json' with {type: 'json'};
import config from '../config/qa.json' with {type: 'json'};

test.use({ storageState: { cookies: [], origins: [] } });

test(qase([1, 2, 3], 'TC-01 — Login'), async({page}) => {

    const login = new LoginPage(page);

    await page.goto(config.paths.login);

    await test.step('TC-01.1 Login with empty email and password', async () => {
        await login.loginWithEmptyFields(
            users.emptyUser.email,
            users.emptyUser.password,
        );
    });

    await test.step('TC-01.2 Login with invalid credentials', async () => {
        await login.loginInvalidData(
            users.invalidUser.email,
            users.invalidUser.password,
        );
    });

    await test.step('TC-01.3 Login with valid credentials', async () => {
        await login.login(
            users.user.email,
            users.user.password
        );
    });

})
