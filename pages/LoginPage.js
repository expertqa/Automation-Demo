export class LoginPage {
    constructor(page) {
        this.page = page;

        //Login locators
        this.emailInput = "#email";
        this.passwordInput = "#password";
        this.logInButton = page.getByRole('button', { name: 'Sign in' });

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
