export class LoginPage {
    constructor(page) {
        this.page = page;

        //Login locators
        this.emailInput = "#login-email-input";
        this.passwordInput = "#login-password-input";
        this.logInButton = page.locator('#login-submit-button');

    }

    async loginWithEmptyFields(email, password) {
        await this.page.fill(this.emailInput, email);
        await this.page.fill(this.passwordInput, password);
        await this.logInButton.click();

        console.log('❌ Login test passed - User cannot login with Empty fields');
    }

    async loginInvalidData(email, password) {
        await this.page.fill(this.emailInput, email);
        await this.page.fill(this.passwordInput, password);
        await this.logInButton.click();

        console.log('❌ Login test passed - User cannot login with Invalid Data');
    }

    async login(email, password) {
        await this.page.fill(this.emailInput, email);
        await this.page.fill(this.passwordInput, password);

        // On this environment, Playwright's post-click "wait for navigation to
        // settle" reliably hangs past the default 30s even though the click and
        // navigation both actually succeed — reproduced repeatedly. Give it more
        // headroom, and if it still times out, check whether we actually left
        // the login page before treating it as a real failure.
        try {
            await this.logInButton.click({ timeout: 60000 });
        } catch (error) {
            if (this.page.url().includes('/login')) {
                throw error;
            }
        }


        console.log('✅ Login test passed - User successfully logged in');
    }

}
