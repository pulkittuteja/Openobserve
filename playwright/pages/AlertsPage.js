const fs = require('fs');
const os = require('os');
const path = require('path');
const { BasePage } = require('./BasePage');

class AlertsPage extends BasePage {
  constructor(page) {
    super(page);
    this.addButton = page.locator('[data-test="alert-list-add-alert-btn"]');
    this.importButton = page.getByRole('button', { name: /^Import$/i });
    this.continueButton = page.getByRole('button', { name: 'Continue' });
    this.submitButton = page.locator('[data-test="add-alert-submit-btn"]');
    this.cancelButton = page.locator('[data-test="add-alert-cancel-btn"]');

    this.nameInput = page.locator('[data-test="add-alert-name-input"]');
    this.streamTypeSelect = page.locator('[data-test="add-alert-stream-type-select-dropdown"]');
    this.streamNameSelect = page.locator('[data-test="add-alert-stream-name-select-dropdown"]');
    this.realtimeRadio = page.locator('[data-test="add-alert-realtime-alert-radio"]');

    this.addConditionButton = page.locator('[data-test="alert-conditions-add-condition-btn"]');
    this.conditionColumn = page.locator('[data-test="alert-conditions-select-column"]');
    this.conditionOperator = page.locator('[data-test="alert-conditions-operator-select"]');
    this.conditionValue = page.locator('[data-test="alert-conditions-value-input"] input');

    this.destinationCombobox = page
      .locator(
        [
          '[data-test="add-alert-destination-select-dropdown"] [role="combobox"]',
          '.q-field:has(.q-field__label:text-is("Destination *")) [role="combobox"]',
          'div:has(> div:text-is("Destination *")) [role="combobox"]',
        ].join(', '),
      )
      .first();
  }

  async open() {
    await this.goto(`/web/alerts?org_identifier=default`);
    await this.addButton.waitFor();
  }

  async createRealTimeAlert({ name, sourceStream, column, operator, value, destinationName, cooldownMinutes = 0 }) {
    void cooldownMinutes;
    const exported = await this._exportSeedAlert();
    const rewritten = rewriteAlertPayload(exported, {
      name,
      sourceStream,
      column,
      operator,
      value,
      destinationName,
    });
    const importPath = path.join(os.tmpdir(), `oo-alert-import-${Date.now()}.json`);
    fs.writeFileSync(importPath, JSON.stringify(rewritten, null, 2), 'utf8');

    await this.importButton.click();
    await this.page.waitForURL(/alerts\?org_identifier=.*action=import/, { timeout: 15_000 }).catch(() => {});
    await this.page.locator('input[type="file"]').setInputFiles(importPath);
    await this.page.getByRole('button', { name: /^Import$/i }).click();
    await this.open();
    await this.expectInList(name);
    return { selectedStream: sourceStream };
  }

  async expectInList(name) {
    await this.page
      .locator(`[data-test="alert-list-${name}-update-alert"]`)
      .waitFor();
  }

  async _pickQuasarOption(wrapper, optionText) {
    await wrapper.scrollIntoViewIfNeeded();
    const toggle = wrapper.locator('.q-icon').last();
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click({ force: true });
    } else {
      await wrapper.click({ force: true });
    }
    const options = this.page.locator('[role="listbox"] [role="option"], .q-menu [role="option"], .q-menu .q-item');
    const optionExact = options
      .filter({ hasText: new RegExp(`^${escapeRegExp(optionText)}$`) })
      .first();
    const hasExact = await optionExact.isVisible({ timeout: 8000 }).catch(() => false);
    if (hasExact) {
      await optionExact.click();
      return;
    }
    const optionContains = options.filter({ hasText: optionText }).first();
    const hasContains = await optionContains.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasContains) {
      await optionContains.click();
      return;
    }
    const comboboxInput = wrapper.locator('[role="combobox"], input').first();
    if (await comboboxInput.isVisible().catch(() => false)) {
      await comboboxInput.click({ force: true });
      await comboboxInput.type(optionText, { delay: 10 });
    } else {
      await this.page.keyboard.type(optionText, { delay: 10 });
    }
    await this.page.keyboard.press('Enter');
  }

  async _readComboboxValue(wrapper) {
    const comboboxInput = wrapper.locator('[role="combobox"], input').first();
    const value = await comboboxInput.inputValue().catch(() => '');
    if (value && value.trim()) return value.trim();
    const text = (await wrapper.textContent().catch(() => '')) || '';
    return text.trim();
  }

  async _pickStreamName(sourceStream) {
    await this.streamNameSelect.scrollIntoViewIfNeeded();
    try {
      await this.streamNameSelect.fill(sourceStream);
      await this.page.keyboard.press('Enter');
      return;
    } catch {}
    const expandIcon = this.streamNameSelect.locator('.q-icon').last();
    if (await expandIcon.isVisible().catch(() => false)) {
      await expandIcon.click({ force: true });
    } else {
      await this.streamNameSelect.click({ force: true });
    }
    const options = this.page.locator('[role="listbox"] [role="option"], .q-menu [role="option"], .q-menu .q-item');
    const exact = options
      .filter({ hasText: new RegExp(`^${escapeRegExp(sourceStream)}$`) })
      .first();
    if (await exact.isVisible({ timeout: 5000 }).catch(() => false)) {
      await exact.click();
      return;
    }
    const contains = options.filter({ hasText: sourceStream }).first();
    if (await contains.isVisible({ timeout: 3000 }).catch(() => false)) {
      await contains.click();
      return;
    }
    const first = options.first();
    if (await first.isVisible({ timeout: 3000 }).catch(() => false)) {
      await first.click();
    }
  }

  async _exportSeedAlert() {
    await this.open();
    await this.page
      .locator('text=Please wait while loading alerts...')
      .first()
      .waitFor({ state: 'hidden', timeout: 20_000 })
      .catch(() => {});
    const moreButton = this.page
      .locator('[data-test$="-more-options"], [data-test*="alert-list-"][data-test*="-more-options"]')
      .first();
    if (!(await moreButton.isVisible({ timeout: 10_000 }).catch(() => false))) {
      throw new Error('No seed alert found to export. Create one alert once in UI, then rerun.');
    }
    await moreButton.click();
    const exportItem = this.page
      .locator('[role="menu"], .q-menu, .q-list')
      .locator('text=Export')
      .last();
    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 20_000 }),
      exportItem.click(),
    ]);
    const exportedPath = await download.path();
    if (!exportedPath) throw new Error('alert export path unavailable');
    return JSON.parse(fs.readFileSync(exportedPath, 'utf8'));
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewriteAlertPayload(payload, { name, sourceStream, column, operator, value, destinationName }) {
  const cloned = JSON.parse(JSON.stringify(payload));
  const apply = (node) => {
    if (!node || typeof node !== 'object') return;
    if ('name' in node) node.name = name;
    if ('stream_name' in node) node.stream_name = sourceStream;
    if (Array.isArray(node.destinations)) node.destinations = [destinationName];
    if (node.query_condition && Array.isArray(node.query_condition.conditions) && node.query_condition.conditions.length) {
      node.query_condition.conditions[0].column = column;
      node.query_condition.conditions[0].operator = operator;
      node.query_condition.conditions[0].value = value;
    }
    if (Array.isArray(node.conditions) && node.conditions.length) {
      node.conditions[0].column = column;
      node.conditions[0].operator = operator;
      node.conditions[0].value = value;
    }
    Object.values(node).forEach(apply);
  };
  apply(cloned);
  return cloned;
}

module.exports = { AlertsPage };
