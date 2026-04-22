const { BasePage } = require('./BasePage');
const { config } = require('../utils/config');

class DestinationsPage extends BasePage {
  constructor(page) {
    super(page);
    this.addButton = page.locator('[data-test="alert-destination-list-add-alert-btn"]');
    this.customDestinationCard = page.getByRole('heading', { name: 'Custom Destination' });
    this.nameInput = page.locator('[data-test="add-destination-name-input"]');
    this.urlInput = page.locator('[data-test="add-destination-url-input"]');
    this.methodSelect = page.locator('[data-test="add-destination-method-select"]');
    this.templateSelect = page.locator('[data-test="add-destination-template-select"]');
    this.addHeaderButton = page.locator('[data-test="add-destination-add-header-btn"]');
    this.headerKeyInput = page.locator('[data-test="add-destination-header--key-input"]');
    this.headerValueInput = page.locator('[data-test="add-destination-header--value-input"]');
    this.submitButton = page.locator('[data-test="add-destination-submit-btn"]');
    this.cancelButton = page.locator('[data-test="add-destination-cancel-btn"]');
  }

  async open() {
    await this.goto(`/web/settings/alert_destinations?org_identifier=default`);
    await this.addButton.waitFor();
  }

  async createStreamDestination({ name, templateName, destinationStream }) {
    await this.addButton.click();
    await this.customDestinationCard.click();

    await this.nameInput.fill(name);
    const ingestUrl = new URL(`${config.baseURL}/api/${config.org}/${destinationStream}/_json`);
    ingestUrl.username = config.user;
    ingestUrl.password = config.password;
    await this.urlInput.fill(ingestUrl.toString());

    await this._pickQuasarOption(this.methodSelect, 'post');
    await this._pickQuasarOption(this.templateSelect, templateName);

    await this.submitButton.click();
    await this.expectInList(name);
  }

  async expectInList(name) {
    await this.page
      .locator(`[data-test="alert-destination-list-${name}-update-destination"]`)
      .waitFor();
  }

  async _pickQuasarOption(wrapper, optionText) {
    await wrapper.click();
    await this.page.locator('.q-menu [role="option"]', { hasText: optionText }).first().click();
  }
}

module.exports = { DestinationsPage };
