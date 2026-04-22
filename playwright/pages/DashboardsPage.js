const { BasePage } = require('./BasePage');

class DashboardsPage extends BasePage {
  constructor(page) {
    super(page);
    this.dashboardsNavLink = page.locator('[data-test="menu-link-/dashboards-item"]');
    this.newDashboardButton = page.getByRole('button', { name: /new dashboard/i });
    this.createDialog = page.locator('.q-dialog').last();
    this.dashboardNameInput = this.createDialog.getByRole('textbox', { name: 'Name *' });
    this.saveDashboardButton = this.createDialog.locator('[data-test="dashboard-add-submit"]')
      .or(this.createDialog.getByRole('button', { name: /^save$/i }));

    this.addPanelButton = page.locator('[data-test="dashboard-if-no-panel-add-panel-btn"]')
      .or(page.locator('[data-test="dashboard-panel-add"]')).first();
    this.chartTypeTable = page.locator('[data-test="selected-chart-table-item"]');
    this.streamDropdown = page.locator('[data-test="index-dropdown-stream"]');
    this.sqlQueryTypeButton = page.locator('[data-test="dashboard-sql-query-type"]');
    this.customQueryTypeButton = page.locator('[data-test="dashboard-custom-query-type"]');
    this.queryEditorMonaco = page.locator('[data-test="dashboard-panel-query-editor"] .monaco-editor .view-lines').first();
    this.queryEditorTextarea = page.locator('[data-test="dashboard-panel-query-editor"] textarea.inputarea');
    this.panelNameInput = page.locator('[data-test="dashboard-panel-name"]');
    this.applyButton = page.locator('[data-test="dashboard-apply"]');
    this.savePanelButton = page.locator('[data-test="dashboard-panel-save"]');
  }

  async open() {
    await this.dashboardsNavLink.click();
    await this.page.waitForURL(/\/web\/dashboards/);
    await this.newDashboardButton.waitFor();
  }

  async createDashboard(name) {
    await this.newDashboardButton.click();
    await this.dashboardNameInput.fill(name);
    await this.saveDashboardButton.click();
    await this.page.waitForURL(/\/dashboards\/view/);
    await this.addPanelButton.waitFor();
  }

  async addSqlTablePanel({ panelName, stream, sql }) {
    await this.addPanelButton.click();
    await this.page.waitForURL(/add_panel/);

    await this.chartTypeTable.click();
    await this.streamDropdown.click();
    await this.page
      .locator('.q-menu [role="option"]', { hasText: new RegExp(`^${escapeRegExp(stream)}$`) })
      .first()
      .click();

    await this.sqlQueryTypeButton.click();
    await this.customQueryTypeButton.click();
    await this.queryEditorMonaco.click();
    await this.page.keyboard.press('ControlOrMeta+A');
    await this.page.keyboard.press('Delete');
    const editorTextbox = this.page
      .locator('[data-test="dashboard-panel-query-editor"]')
      .getByRole('textbox')
      .first();
    await editorTextbox.pressSequentially(sql, { delay: 10 });
    await this.page.keyboard.press('Escape');
    await this.panelNameInput.fill(panelName);
    await this.applyButton.click();
    await this.savePanelButton.click();
    await this.page.waitForURL(/\/dashboards\/view/);
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { DashboardsPage };
