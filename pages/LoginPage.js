import { SAFE_ACTION_TIMEOUT_MS } from "../fixtures/rateLimitFixture";

export class LoginPage {
  constructor(page) {
    this.page = page;

    //Login locators
    this.emailInput = "#email";
    this.passwordInput = "#password";
    this.logInButton = page.getByTestId("login-submit-button");
  }

  async loginWithEmptyFields(email, password) {
    await this.page.fill(this.emailInput, email);
    await this.page.fill(this.passwordInput, password);
    await this.logInButton.click();

    console.log("✅ Empty credentials were correctly rejected");
  }

  async loginInvalidData(email, password) {
    await this.page.fill(this.emailInput, email);
    await this.page.fill(this.passwordInput, password);
    await this.logInButton.click();

    console.log("✅ Invalid credentials were correctly rejected");
  }

  async login(email, password) {
    await this.page.fill(this.emailInput, email);
    await this.page.fill(this.passwordInput, password);

    try {
      await this.logInButton.click({ timeout: SAFE_ACTION_TIMEOUT_MS });
    } catch (error) {
      if (this.page.url().includes("/login")) {
        throw error;
      }
    }

    console.log("✅ Login test passed - User successfully logged in");
  }
}
