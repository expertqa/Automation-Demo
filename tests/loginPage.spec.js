import {test} from '@playwright/test';
import {LoginPage} from '../pages/LoginPage';
import users from '../data/users.json' with {type: 'json'};
import config from '../config/qa.json' with {type: 'json'};

test.use({ storageState: { cookies: [], origins: [] } });

test('Test LoginPage', async({page}) => {

    const login = new LoginPage(page);

    await page.goto(config.paths.login);

    await login.loginWithEmptyFields(
        users.emptyUser.email,
        users.emptyUser.password,

    );

    await login.loginInvalidData(

        users.invalidUser.email,
        users.invalidUser.password,

    );

    await login.login(

        users.user.email,
        users.user.password
    );

})
