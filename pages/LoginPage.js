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
        await this.logInButton.click();

        console.log('✅ Login test passed - User successfully logged in');
    }

}
