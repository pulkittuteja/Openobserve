const { BasePage } = require('./BasePage');
const { config } = require('../utils/config');

class LoginPage extends BasePage {
  constructor(page) {
    super(page);
    this.emailInput = page.locator('[data-test="login-user-id"]');
    this.passwordInput = page.locator('[data-test="login-password"]');
    this.loginButton = page.getByRole('button', { name: 'Login' });
  }

  async open() {
    await this.goto('/web/login');
  }

  async loginWithDefaults() {
    await this.login(config.user, config.password);
  }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    await this.page.waitForURL(/\/web\/(?!login)/);
  }
}

module.exports = { LoginPage };
