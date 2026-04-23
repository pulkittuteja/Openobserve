# OpenObserve QA Automation

Automated test suite for the OpenObserve QA assignment. Covers four modules:

| # | Module | Framework | Location |
|---|---|---|---|
| 1 | Logs ingestion + search (API) | pytest + requests | `pytest/tests/test_logs.py` |
| 2 | Real-time alert with stream destination (UI) | Playwright | `playwright/tests/alerts.spec.js` |
| 3 | Dashboard panel on ingested data (UI) | Playwright | `playwright/tests/dashboard.spec.js` |
| 4 | Pipeline routing to another stream (UI) | Playwright | `playwright/tests/pipeline.spec.js` |

## Project layout

```
openobserve-qa/
├── pytest/
│   ├── conftest.py              # shared fixtures (client, unique_stream, time_window_us)
│   ├── helpers/
│   │   ├── config.py            # env-driven config object
│   │   └── api_client.py        # ingest, search, search_until, delete_stream
│   ├── tests/test_logs.py
│   ├── pytest.ini
│   └── requirements.txt
└── playwright/
    ├── pages/                   # Page Object Model
    │   ├── BasePage.js
    │   ├── LoginPage.js
    │   ├── TemplatesPage.js
    │   ├── DestinationsPage.js
    │   ├── AlertsPage.js
    │   ├── DashboardsPage.js
    │   └── PipelinesPage.js
    ├── utils/
    │   ├── config.js            # env-driven config
    │   ├── apiClient.js         # used from UI tests for setup/teardown
    │   └── testData.js          # unique name generator
    ├── tests/
    │   ├── alerts.spec.js
    │   ├── dashboard.spec.js
    │   └── pipeline.spec.js
    ├── playwright.config.js
    ├── .env.example
    └── package.json
```

## Prerequisites

1. **OpenObserve** running locally and reachable at `http://localhost:5080`.
   The fastest way is Docker:
   ```bash
   docker run -d --name openobserve \
     -v $PWD/data:/data \
     -p 5080:5080 \
     -e ZO_ROOT_USER_EMAIL="root@example.com" \
     -e ZO_ROOT_USER_PASSWORD="Complexpass#123" \
     public.ecr.aws/zinclabs/openobserve:latest
   ```
2. **Python 3.11+** and **Node 18+**.

## Configuration

All tests read from environment variables, with the assignment defaults baked in:

| Var | Default |
|---|---|
| `OO_BASE_URL` | `http://localhost:5080` |
| `OO_ORG` | `default` |
| `OO_USER` | `root@example.com` |
| `OO_PASSWORD` | `Complexpass#123` |
| `OO_SLOWMO` | `0` (Playwright only) |

Both test projects also support a `.env` file for local overrides (gitignored).

**Precedence (highest wins):**
1. Real shell environment variables
2. `.env` file in the project directory (`pytest/.env` or `playwright/.env`)
3. Built-in defaults (shown above, matching the assignment)

**Typical workflow against a non-default instance:**
```bash
cp pytest/.env.example pytest/.env        # and edit the values
cp playwright/.env.example playwright/.env # and edit the values
```
`.env` never lands in git — the suite still runs with no `.env` for reviewers against a default-configured local OpenObserve.

## Running the tests

### Module 1 — pytest

```bash
cd pytest
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest
```
Pytest also generates a self-contained HTML report at `pytest/reports/pytest-report.html`.

### Modules 2–4 — Playwright

```bash
cd playwright
npm install
npx playwright install chromium
npm test                    # headless
npm run test:headed         # watch it run
npm run test:ui             # Playwright UI mode
npm run report              # open last HTML report
```

Run a single module:
```bash
npx playwright test tests/alerts.spec.js
```

## How the tests are structured

### Module 1 — API (pytest)

- **`OpenObserveClient`** wraps `requests.Session` with `ingest_json`, `search`,
  `search_until`, and `delete_stream`. Each method is a single, narrow
  responsibility — tests read like prose.
- **Fixtures (`conftest.py`)**
  - `client` — session-scoped API client.
  - `unique_stream` — yields a unique stream name per test and deletes it
    after the test finishes. Tests never collide on shared state.
  - `time_window_us` — ±15 minute window around now, in microseconds,
    so search ranges are always valid.
- **`test_ingested_records_are_returned_by_search`** ingests 5 records tagged
  with a `run_id`, polls search until all 5 come back, and asserts every
  field of every record matches by message key (order-independent).
- **`test_search_filters_apply_correctly`** proves SQL `WHERE` is respected,
  so the previous test isn't accidentally passing on a "return everything"
  endpoint.

### Module 2 — Alerts (Playwright)

Three POMs mirror the three UI artefacts the feature requires:
1. `TemplatesPage.create()` — writes a JSON-array template into the Monaco
   editor using the documented `{alert_name}` / `{stream_name}` variables.
   If Monaco form-sync fails, it falls back to Template import through the UI.
2. `DestinationsPage.createStreamDestination()` — creates a **Custom (HTTP)**
   destination pointing at another stream's `_json` ingest URL.
3. `AlertsPage.createRealTimeAlert()` — creates the alert via the Alerts
   Import UI flow (export an existing alert JSON, rewrite name/source/
   destination/condition, then import it from the UI).

The spec then ingests `{level: 'error'}` into the source stream and polls the
destination stream until alert-formatted records appear. Assertions check the
template fields (`alert_name`, `stream_name`, `alert_type`) actually got
substituted — not just that "something arrived".

### Module 3 — Dashboards (Playwright)

The test seeds the target stream via the API first (via `searchUntil` we
wait deterministically until the data is queryable), then drives the UI to
create a dashboard, add a SQL panel, and save. Because Monaco can sometimes
desync from Vue state in headless mode, the spec patches the saved SQL via API
(`setFirstPanelSql`) and reloads the page. Final assertions verify the panel
is not empty and shows rendered records.

### Module 4 — Pipelines (Playwright)

1. Pre-create the source stream via the API so it's selectable in the node
   dialog, and pre-seed the destination stream so it can be selected from
   the destination node dropdown.
2. Build the pipeline: drop the source node, delete the auto-created
   default output, drop a destination node, connect the handles, save.
3. Ingest a batch tagged with a unique `run` value *after* the pipeline is
   saved — pipelines only apply to data ingested after creation.
4. Verify routing from the Logs UI by selecting the destination stream,
   running query, and asserting tagged records/values are visible.

## Design choices

- **Page Object Model.** Core UI flows are implemented in page objects
  (`TemplatesPage`, `DestinationsPage`, `AlertsPage`, `DashboardsPage`,
  `PipelinesPage`) and specs call intent-named methods. Module 4 currently
  keeps a small Logs-verification helper in `pipeline.spec.js`.
- **No hard-coded sleeps.** Waits are driven by either Playwright's auto-wait
  on locators/toasts, or by `searchUntil`, which polls a concrete predicate
  (e.g. "destination stream has ≥1 hit") with a deadline.
- **Isolation.** Each test creates streams/dashboards/pipelines with unique
  names (`crypto.randomBytes` / `uuid`) and tears them down in `afterAll`.
  Re-runs leave no residue.
- **Meaningful assertions.** Tests check *data content* end-to-end — field
  values, tagged records, rendered chart content — not just HTTP 200s or
  "page loaded". A mocked or broken backend would cause them to fail.
- **API client in UI tests.** Setup/teardown and result verification for UI
  tests use the API directly. This keeps the UI test focused on the
  thing it's actually validating (the UI flow) while still asserting on
  real backend state.
