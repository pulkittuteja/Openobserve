// @ts-check
const crypto = require('crypto');
const { request } = require('@playwright/test');
const { config } = require('./config');

/**
 * A tiny API client used from UI tests for deterministic setup/teardown
 * (seeding data, polling the destination stream, cleaning up streams).
 * Keeping API and UI concerns in separate helpers means the tests can
 * assert on real backend state rather than only on what the UI renders.
 */
class ApiClient {
  /** @param {import('@playwright/test').APIRequestContext} ctx */
  constructor(ctx) {
    this.ctx = ctx;
  }

  static async create() {
    const ctx = await request.newContext({
      baseURL: config.baseURL,
      extraHTTPHeaders: {
        Authorization: config.basicAuthHeader,
        'Content-Type': 'application/json',
      },
    });
    return new ApiClient(ctx);
  }

  async dispose() {
    await this.ctx.dispose();
  }

  /** Ingest a JSON array of records into a stream (auto-creates the stream). */
  async ingest(streamName, records) {
    const response = await this.ctx.post(`/api/${config.org}/${streamName}/_json`, {
      data: records,
    });
    if (!response.ok()) {
      throw new Error(`Ingest failed: ${response.status()} ${await response.text()}`);
    }
    return response.json();
  }

  /**
   * Run a SQL search. `windowMinutes` controls how far back in time we look;
   * most UI flows ingest and verify within a couple of minutes.
   */
  async search(sql, { windowMinutes = 15, size = 100 } = {}) {
    const endUs = Date.now() * 1000;
    const startUs = endUs - windowMinutes * 60 * 1_000_000;
    const response = await this.ctx.post(`/api/${config.org}/_search?type=logs`, {
      data: {
        query: { sql, start_time: startUs, end_time: endUs, from: 0, size },
      },
    });
    if (!response.ok()) {
      throw new Error(`Search failed: ${response.status()} ${await response.text()}`);
    }
    return response.json();
  }

  /**
   * Poll the search endpoint until a predicate is satisfied. Used in place
   * of hard sleeps when waiting for an alert to fire or a pipeline to route.
   */
  async searchUntil(sql, predicate, { timeoutMs = 60_000, intervalMs = 2000, windowMinutes = 15 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastHits = [];
    while (Date.now() < deadline) {
      try {
        const body = await this.search(sql, { windowMinutes });
        lastHits = body.hits || [];
        if (predicate(lastHits)) return lastHits;
      } catch (err) {
        // "Stream not found" is expected while waiting for the destination
        // stream to be auto-created by the alert / pipeline — keep polling.
        if (!/stream not found/i.test(String(err))) throw err;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(
      `searchUntil timed out after ${timeoutMs}ms. Last hit count: ${lastHits.length}. SQL: ${sql}`,
    );
  }

  /** Best-effort stream cleanup so tests can be re-run without residue. */
  async deleteStream(streamName, type = 'logs') {
    try {
      await this.ctx.delete(`/api/${config.org}/streams/${streamName}?type=${type}`);
    } catch {
      /* ignore — cleanup is best-effort */
    }
  }

  /**
   * Create an alert template. Body is an opaque string OpenObserve stores
   * as-is; for stream destinations it must be a valid JSON array after
   * template-variable substitution.
   */
  async createAlertTemplate(name, body) {
    const response = await this.ctx.post(`/api/${config.org}/alerts/templates`, {
      data: { name, body, type: 'http', title: '' },
    });
    if (!response.ok()) {
      throw new Error(`Create template failed: ${response.status()} ${await response.text()}`);
    }
    return response.json();
  }

  async deleteAlertTemplate(name) {
    try {
      await this.ctx.delete(`/api/${config.org}/alerts/templates/${name}`);
    } catch {
      /* ignore */
    }
  }

  /**
   * Create a Custom (HTTP) alert destination that POSTs to another stream's
   * ingest URL. Headers include a Basic-auth Authorization header so the
   * destination can actually write to the sink stream.
   * @param {object} opts
   * @param {string} opts.name
   * @param {string} opts.templateName
   * @param {string} opts.destinationStream
   */
  async createStreamDestination({ name, templateName, destinationStream }) {
    const response = await this.ctx.post(`/api/${config.org}/alerts/destinations`, {
      data: {
        name,
        url: `${config.baseURL}/api/${config.org}/${destinationStream}/_json`,
        method: 'post',
        skip_tls_verify: false,
        template: templateName,
        headers: { Authorization: config.basicAuthHeader },
      },
    });
    if (!response.ok()) {
      throw new Error(`Create destination failed: ${response.status()} ${await response.text()}`);
    }
    return response.json();
  }

  async deleteDestination(name) {
    try {
      await this.ctx.delete(`/api/${config.org}/alerts/destinations/${name}`);
    } catch {
      /* ignore */
    }
  }

  /**
   * List dashboards in a folder. Used by dashboard tests to look up the
   * dashboard id after UI-creation, so we can subsequently patch the panel
   * query via API (workaround for Monaco/Vue desync in headless Chromium).
   */
  async listDashboards(folder = 'default') {
    const response = await this.ctx.get(`/api/${config.org}/dashboards?folder=${folder}`);
    if (!response.ok()) {
      throw new Error(`List dashboards failed: ${response.status()}`);
    }
    const body = await response.json();
    return (body.dashboards || []).map((d) => {
      for (const key of ['v8', 'v7', 'v6', 'v5', 'v4', 'v3', 'v2', 'v1']) {
        if (d[key]) return d[key];
      }
      return null;
    }).filter(Boolean);
  }

  async findDashboardByName(name, folder = 'default') {
    const dashboards = await this.listDashboards(folder);
    return dashboards.find((d) => d.title === name) || null;
  }

  /**
   * Fetch the full dashboard record (includes outer hash for optimistic
   * locking on update).
   */
  async getDashboard(dashboardId, folder = 'default') {
    const response = await this.ctx.get(
      `/api/${config.org}/dashboards/${dashboardId}?folder=${folder}`,
    );
    if (!response.ok()) {
      throw new Error(`Get dashboard ${dashboardId} failed: ${response.status()}`);
    }
    return response.json();
  }

  /**
   * PUT the v8 dashboard definition. The server enforces optimistic
   * locking via the `hash` query param — read the current hash, pass it
   * back with the update.
   */
  async updateDashboard(dashboardId, v8, hash, folder = 'default') {
    const response = await this.ctx.put(
      `/api/${config.org}/dashboards/${dashboardId}?folder=${folder}&hash=${hash}`,
      { data: v8 },
    );
    if (!response.ok()) {
      throw new Error(`Update dashboard failed: ${response.status()} ${await response.text()}`);
    }
    return response.json();
  }

  /**
   * Patch the first panel's SQL in a dashboard. Workaround for Monaco's
   * editor-value vs Vue reactive state desync in headless: the UI creates
   * the dashboard + panel shell correctly, this fills in the query
   * server-side so the panel renders data for the visual assertion.
   */
  async setFirstPanelSql(dashboardName, sql, folder = 'default') {
    const shallow = await this.findDashboardByName(dashboardName, folder);
    if (!shallow) throw new Error(`Dashboard not found: ${dashboardName}`);
    const full = await this.getDashboard(shallow.dashboardId, folder);
    const v8 = full.v8;
    const hash = full.hash;
    if (!v8) throw new Error(`Dashboard ${dashboardName} has no v8 payload`);
    for (const tab of v8.tabs || []) {
      const panel = tab.panels?.[0];
      if (panel && panel.queries?.[0]) {
        panel.queries[0].query = sql;
        panel.queries[0].customQuery = true;
        await this.updateDashboard(v8.dashboardId, v8, hash, folder);
        return;
      }
    }
    throw new Error(`No panel found in dashboard: ${dashboardName}`);
  }

  async deleteDashboardByName(name, folder = 'default') {
    const dashboard = await this.findDashboardByName(name, folder);
    if (!dashboard) return;
    try {
      await this.ctx.delete(
        `/api/${config.org}/dashboards/${dashboard.dashboardId}?folder=${folder}`,
      );
    } catch {
      /* ignore */
    }
  }

  /**
   * Create a simple realtime pipeline that routes a source stream to a
   * different destination stream (Module 4). UI-driving Vue Flow's drag +
   * edge-draw proved too brittle in headless Chromium, so the test uses
   * the API to create the artefact and verifies the data flow end-to-end.
   */
  async createStreamToStreamPipeline({ name, sourceStream, destinationStream }) {
    const srcId = crypto.randomUUID();
    const dstId = crypto.randomUUID();
    const body = {
      name,
      description: '',
      source: {
        source_type: 'realtime',
        org_id: config.org,
        stream_name: sourceStream,
        stream_type: 'logs',
      },
      nodes: [
        {
          id: srcId,
          data: { node_type: 'stream', org_id: config.org, stream_name: sourceStream, stream_type: 'logs' },
          position: { x: 150, y: 220 },
          io_type: 'input',
        },
        {
          id: dstId,
          data: { node_type: 'stream', org_id: config.org, stream_name: destinationStream, stream_type: 'logs' },
          position: { x: 250, y: 450 },
          io_type: 'output',
        },
      ],
      edges: [
        { id: `e${srcId}-${dstId}`, source: srcId, target: dstId },
      ],
    };
    const response = await this.ctx.post(`/api/${config.org}/pipelines`, { data: body });
    if (!response.ok()) {
      throw new Error(`Create pipeline failed: ${response.status()} ${await response.text()}`);
    }
    return response.json();
  }

  async listPipelines() {
    const response = await this.ctx.get(`/api/${config.org}/pipelines`);
    if (!response.ok()) throw new Error(`List pipelines failed: ${response.status()}`);
    const body = await response.json();
    return body.list || [];
  }

  async deletePipelineByName(name) {
    const pipelines = await this.listPipelines();
    const p = pipelines.find((x) => x.name === name);
    if (!p) return;
    try {
      await this.ctx.delete(`/api/${config.org}/pipelines/${p.pipeline_id}`);
    } catch {
      /* ignore */
    }
  }

  /**
   * Create a real-time alert via API (v2 endpoint). `conditions` is a
   * list of `{ column, operator, value }` triples which are AND-ed.
   */
  async createRealTimeAlert({ name, sourceStream, conditions, destinationName, silenceMinutes = 0, folder = 'default' }) {
    const body = {
      name,
      stream_type: 'logs',
      stream_name: sourceStream,
      is_real_time: true,
      query_condition: {
        type: 'custom',
        conditions: {
          version: 2,
          conditions: {
            filterType: 'group',
            logicalOperator: 'AND',
            conditions: conditions.map((c) => ({
              filterType: 'condition',
              column: c.column,
              operator: c.operator,
              value: c.value,
              logicalOperator: 'AND',
            })),
          },
        },
      },
      trigger_condition: {
        period: 10,
        operator: '=',
        threshold: 1,
        frequency: 1,
        cron: '',
        frequency_type: 'minutes',
        silence: silenceMinutes,
        timezone: 'UTC',
        align_time: true,
      },
      destinations: [destinationName],
      enabled: true,
      description: '',
    };
    const response = await this.ctx.post(
      `/api/v2/${config.org}/alerts?folder=${folder}`,
      { data: body },
    );
    if (!response.ok()) {
      throw new Error(`Create alert failed: ${response.status()} ${await response.text()}`);
    }
    const result = await response.json();
    this._lastAlertId = result.id;
    return result;
  }

  /**
   * Delete the most recently created alert. (v2 API uses an opaque id
   * rather than name, so we cache it from the create-response.)
   */
  async deleteLastAlert() {
    if (!this._lastAlertId) return;
    try {
      await this.ctx.delete(`/api/v2/${config.org}/alerts/${this._lastAlertId}`);
    } catch {
      /* ignore */
    }
  }

  async deleteAlertByName(name, folder = 'default') {
    try {
      const response = await this.ctx.get(`/api/v2/${config.org}/alerts?folder=${folder}`);
      if (!response.ok()) return;
      const body = await response.json();
      const match = (body.list || []).find((a) => a.name === name);
      if (!match?.alert_id) return;
      await this.ctx.delete(`/api/v2/${config.org}/alerts/${match.alert_id}`);
    } catch {
      /* ignore */
    }
  }
}

module.exports = { ApiClient };
