const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { PipelinesPage } = require('../pages/PipelinesPage');
const { ApiClient } = require('../utils/apiClient');
const { uniqueId } = require('../utils/testData');

test.describe('Pipelines — route data to another stream', () => {
  const pipelineName = uniqueId('pipe');
  const sourceStream = uniqueId('pipe_src');
  const destStream = uniqueId('pipe_dst');

  let api;

  test.beforeAll(async () => {
    api = await ApiClient.create();
    await api.ingest(sourceStream, [
      { level: 'info', message: 'seed', service: 'bootstrap' },
    ]);
    await api.ingest(destStream, [
      { level: 'info', message: 'dest seed', service: 'bootstrap' },
    ]);
  });

  test.afterAll(async () => {
    await api.deletePipelineByName(pipelineName);
    await api.deleteStream(sourceStream);
    await api.deleteStream(destStream);
    await api.dispose();
  });

  test('records ingested post-pipeline appear in the destination stream', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open();
    await login.loginWithDefaults();

    const pipelines = new PipelinesPage(page);
    await pipelines.open();
    await pipelines.createStreamToStreamPipeline({
      name: pipelineName,
      sourceStream,
      destinationStream: destStream,
    });
    await expect(page.locator('[data-test="pipeline-list-table"]')).toContainText(pipelineName);
    const runTag = uniqueId('run');
    const records = [
      { level: 'info', message: `routed 1 ${runTag}`, service: 'pipe', run: runTag },
      { level: 'info', message: `routed 2 ${runTag}`, service: 'pipe', run: runTag },
      { level: 'error', message: `routed 3 ${runTag}`, service: 'pipe', run: runTag, code: 500 },
    ];
    await api.ingest(sourceStream, records);
    await page.goto('/web/logs?org_identifier=default');
    await page.locator('[data-test="log-search-index-list-select-stream"]').waitFor();
    await pickQuasarOption(page, '[data-test="log-search-index-list-select-stream"]', destStream);
    await page.locator('[data-test="logs-search-bar-refresh-btn"]').click();

    await expect(page.locator('body')).toContainText(`routed 1 ${runTag}`, { timeout: 60_000 });
    await expect(page.locator('body')).toContainText(`routed 2 ${runTag}`, { timeout: 60_000 });
    await expect(page.locator('body')).toContainText(`routed 3 ${runTag}`, { timeout: 60_000 });
    await expect(page.locator('body')).toContainText('500', { timeout: 60_000 });
  });
});

async function pickQuasarOption(page, wrapperSelector, optionText) {
  const wrapper = page.locator(wrapperSelector).first();
  await wrapper.click();
  await page
    .locator('[role="listbox"] [role="option"], .q-menu [role="option"], .q-menu .q-item')
    .filter({ hasText: new RegExp(`^${escapeRegExp(optionText)}$`) })
    .first()
    .click();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
