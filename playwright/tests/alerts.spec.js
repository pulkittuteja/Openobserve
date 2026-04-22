const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { TemplatesPage } = require('../pages/TemplatesPage');
const { DestinationsPage } = require('../pages/DestinationsPage');
const { AlertsPage } = require('../pages/AlertsPage');
const { ApiClient } = require('../utils/apiClient');
const { uniqueId } = require('../utils/testData');

const TEMPLATE_BODY = `[
{
"alert_name": "{alert_name}",
"org_name": "{org_name}",
"stream_name": "{stream_name}",
"alert_type": "{alert_type}",
"timestamp": "{timestamp}"
}
]`;

test.describe('Alerts — real-time with stream destination', () => {
  test.setTimeout(180_000);
  const templateName = uniqueId('tpl');
  const destinationName = uniqueId('dest');
  const alertName = uniqueId('alert');
  const sourceStream = 'qa_manual_logs';
  const destStream = uniqueId('dst');

  let api;

  test.beforeAll(async () => {
    api = await ApiClient.create();
    await api.ingest(sourceStream, [
      { level: 'info', message: 'seed record', service: 'seed' },
    ]);
  });

  test.afterAll(async () => {
    await api.deleteAlertByName(alertName);
    await api.deleteDestination(destinationName);
    await api.deleteAlertTemplate(templateName);
    await api.deleteStream(destStream);
    await api.dispose();
  });

  test('alert fires on matching record and writes to destination stream', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open();
    await login.loginWithDefaults();

    const templates = new TemplatesPage(page);
    await templates.open();
    await templates.create(templateName, TEMPLATE_BODY);

    const destinations = new DestinationsPage(page);
    await destinations.open();
    await destinations.createStreamDestination({
      name: destinationName,
      templateName,
      destinationStream: destStream,
    });

    const alerts = new AlertsPage(page);
    await alerts.open();
    const { selectedStream } = await alerts.createRealTimeAlert({
      name: alertName,
      sourceStream,
      column: 'level',
      operator: '=',
      value: 'error',
      destinationName,
      cooldownMinutes: 0,
    });
    const triggerStream = selectedStream || sourceStream;
    await api.ingest(triggerStream, [
      { level: 'error', message: 'Alert trigger', code: 500, run: alertName },
    ]);
    const hits = await api.searchUntil(
      `SELECT * FROM "${destStream}" WHERE alert_name = '${alertName}'`,
      (h) => h.length >= 1,
      { timeoutMs: 120_000, intervalMs: 3000 },
    );

    expect(hits.length).toBeGreaterThanOrEqual(1);
    const hit = hits[0];
    expect(hit.alert_name).toBe(alertName);
    expect(hit.org_name).toBe('default');
    expect(hit.stream_name).toBe(triggerStream);
    expect(hit.alert_type?.toLowerCase()).toContain('real');
    expect(hit.timestamp).toBeTruthy();
  });
});
