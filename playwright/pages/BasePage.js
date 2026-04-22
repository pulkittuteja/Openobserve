class BasePage {
  constructor(page) {
    this.page = page;
  }

  async goto(path) {
    await this.page.goto(path);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async waitForToast(text) {
    await this.page.locator('.q-notification', { hasText: text }).waitFor({ state: 'visible' });
  }
}

module.exports = { BasePage };
