const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { DashboardsPage } = require('../pages/DashboardsPage');
const { ApiClient } = require('../utils/apiClient');
const { uniqueId } = require('../utils/testData');

test.describe('Dashboards — panel backed by ingested data', () => {
  const stream = uniqueId('dash');
  const dashboardName = uniqueId('dashboard');
  const panelName = uniqueId('panel');

  let api;

  test.beforeAll(async () => {
    api = await ApiClient.create();
    const records = Array.from({ length: 5 }, (_, i) => ({
      level: i % 2 === 0 ? 'info' : 'error',
      service: 'dash-test',
      message: `dashboard seed ${i}`,
      latency_ms: 50 + i * 17,
    }));
    await api.ingest(stream, records);
    await api.searchUntil(
      `SELECT * FROM "${stream}"`,
      (hits) => hits.length >= records.length,
      { timeoutMs: 30_000 },
    );
  });

  test.afterAll(async () => {
    await api.deleteDashboardByName(dashboardName);
    await api.deleteStream(stream);
    await api.dispose();
  });

  test('panel renders data from the ingested stream', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open();
    await login.loginWithDefaults();
    const dashboards = new DashboardsPage(page);
    await dashboards.open();
    await dashboards.createDashboard(dashboardName);
    const sql = `SELECT * FROM "${stream}"`;
    await dashboards.addSqlTablePanel({ panelName, stream, sql });
    await api.setFirstPanelSql(dashboardName, sql);
    await page.reload();
    await expect(page.locator('text=/No Data/i')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('body')).toContainText(/of\s+5/, { timeout: 20_000 });
  });
});
