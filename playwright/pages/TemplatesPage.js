const fs = require('fs');
const os = require('os');
const path = require('path');
const { BasePage } = require('./BasePage');

class TemplatesPage extends BasePage {
  constructor(page) {
    super(page);
    this.addButton = page.locator('[data-test="template-list-add-btn"]');
    this.nameInput = page.locator('[data-test="add-template-name-input"]');
    this.webhookTab = page.getByRole('button', { name: /^Web Hook$/i });
    this.editorTextbox = page.getByRole('textbox', { name: 'Editor content' });
    this.submitButton = page.locator('[data-test="add-template-submit-btn"]');
    this.cancelButton = page.locator('[data-test="add-template-cancel-btn"]');
  }

  async open() {
    await this.goto(`/web/settings/templates?org_identifier=default`);
    await this.addButton.waitFor();
    await this.page
      .locator('text=Please wait while loading templates...')
      .first()
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {});
  }

  async create(name, bodyJson) {
    try {
      await this._createViaEditor(name, bodyJson);
    } catch {
      await this._createViaImport(name, bodyJson);
    }
    await this.expectInList(name);
  }

  async expectInList(name) {
    await this.page
      .locator('text=Please wait while loading templates...')
      .first()
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {});
    const row = this.page.locator(`[data-test="alert-template-list-${name}-update-template"]`);
    const isVisible = await row.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) return;
    const errors = await this.page
      .locator('.q-field__messages, .q-notification__message, .text-negative')
      .allTextContents();
    const bodyLine = (await this.page.locator('.monaco-editor .view-line').first().textContent().catch(() => '')) || '';
    const nameValue = await this.nameInput.inputValue().catch(() => '');
    throw new Error(
      `Template did not appear in list. url=${this.page.url()} errors=${errors.join(' | ')} name=${nameValue} bodyLine=${bodyLine}`,
    );
  }

  async _createViaEditor(name, bodyJson) {
    await this.addButton.click();
    await this.nameInput.fill(name);
    const hasWebhookTab = await this.webhookTab.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasWebhookTab) await this.webhookTab.click();
    await this.editorTextbox.waitFor({ state: 'visible' });
    await this.editorTextbox.fill(bodyJson);
    await this.submitButton.click();
    await this.page
      .locator(`[data-test="alert-template-list-${name}-update-template"]`)
      .waitFor({ timeout: 5000 });
  }

  async _createViaImport(name, bodyJson) {
    await this.goto(`/web/settings/templates?org_identifier=default`);
    await this.addButton.waitFor();

    const sourceRow = this.page.getByRole('row', { name: /qa_manual_template/i });
    const exportBtn = sourceRow.getByRole('button', { name: /Export Template/i });
    const downloadPromise = this.page.waitForEvent('download');
    await exportBtn.click();
    const download = await downloadPromise;
    const exportPath = await download.path();
    if (!exportPath) throw new Error('template export path unavailable');

    const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    const rewritten = rewriteTemplatePayload(exported, name, bodyJson);
    const importPath = path.join(os.tmpdir(), `oo-template-import-${Date.now()}.json`);
    fs.writeFileSync(importPath, JSON.stringify(rewritten, null, 2), 'utf8');

    await this.page.getByRole('button', { name: /Import/i }).click();
    await this.page.waitForURL(/templates\/import/, { timeout: 15_000 }).catch(() => {});
    await this.page.locator('input[type="file"]').setInputFiles(importPath);
    await this.page.getByRole('button', { name: /^Import$/i }).click();
    await this.goto(`/web/settings/templates?org_identifier=default`);
  }
}

function rewriteTemplatePayload(payload, name, body) {
  if (Array.isArray(payload)) {
    return payload.map((item, idx) => ({
      ...item,
      name: idx === 0 ? name : `${name}_${idx}`,
      body: idx === 0 ? body : item.body,
    }));
  }
  if (payload && typeof payload === 'object') {
    return { ...payload, name, body };
  }
  throw new Error('unexpected template export payload');
}

module.exports = { TemplatesPage };
