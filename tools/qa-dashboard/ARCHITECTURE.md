# QA Dashboard — Architecture

Local-first Playwright test observability for `accept-mission-playwright`.

## What was found in the repository

| Item | Finding |
|---|---|
| Framework | Playwright `1.61.1`, JavaScript (CommonJS package, ESM syntax transpiled by Playwright), page-object model in `pages/`, specs in `tests/` (+ `unstable/`) |
| Config | `playwright.config.js` — `globalSetup` (login once → `state.json`), `workers: 1`, `retries: 2` on CI, `headless` only on CI, `trace: 'on-first-retry'`, no screenshot/video settings |
| Reporters | `html` + `junit` (`test-results/junit.xml`) — kept untouched, the dashboard reporter is added alongside |
| CI | GitHub Actions `.github/workflows/playwright.yml` (Node 18, `npm ci`, chromium, upload `playwright-report`), plus an Azure Pipelines file wired to a deploy pipeline |
| Git | `origin` → `https://github.com/raheelaofficial6/accept-mission-playwright.git`, branch `main` |
| Tests | 15 tests across 7 spec files, titles like `TC-02 — Funnel, Idea & Kanban` with `test.step` sub-cases; no `test.describe` blocks — suites are derived from spec file names |

## Data pipeline

```
Playwright run
  └─ reporter/index.ts  (zero external deps; runs inside the Playwright process)
       ├─ collects TestCase/TestResult/attachments/stdout/stderr/errors
       ├─ resolves git + CI context (env adapters → git CLI fallback)
       └─ writes a *result package* directory:
            results.json  +  artifacts/<testId>/<attempt>-<name>
              │
              ├─ MODE local   → ingest immediately into dashboard-data/  (SQLite + artifacts/)
              └─ MODE package → leave package on disk (CI uploads it as an artifact)
                                    │
                                    └─ npm run dashboard:import <dir|zip>  → same ingest code path
                                                  │
                                            SQLite (Drizzle)  +  dashboard-data/artifacts/<runId>/<testId>/
                                                  │
                                            Fastify API (127.0.0.1:3000)
                                                  │
                                            React + Vite dashboard
```

One ingestion code path (`ingest/ingest-package.ts`) is used by both local runs and CI imports, so the two modes cannot drift.

## Package layout (`tools/qa-dashboard/`)

| Folder | Responsibility |
|---|---|
| `shared/` | Pure domain logic with no runtime dependencies: types, stable test IDs, GitHub URL builder, run/test status rules, flaky detection, history maths, package format validation |
| `reporter/` | Playwright reporter + collector, git info, CI adapters (`GitHubActionsAdapter`, `AzurePipelinesAdapter`, `GenericCiAdapter`; Jenkins can be added as one file) |
| `ingest/` | Package writer, package reader (directory or zip, zip-slip safe), ingestion into DB + artifact store |
| `database/` | Drizzle schema, SQL migrations, migrator, connection factory |
| `artifacts/` | Artifact store: path layout, safe path resolution (no traversal), copy/move, MIME mapping |
| `server/` | Fastify app: routes → services (queries) → DB. Artifact streaming with HTTP Range. Trace adapter. |
| `cli/` | `qa-dashboard start|import|seed|reset|package|migrate` |
| `app/` | Vite + React + TypeScript + Tailwind + shadcn-style UI + Recharts |
| `fixtures/` | A self-contained Playwright project used to generate a real sample run (pass / fail / flaky / skipped, with screenshot, video and trace) |
| `tests/` | Vitest unit tests and Playwright UI tests for the dashboard |

## Data model

```
runs ─┬─< run_tests ─┬─< test_attempts ─┬─< errors
      │              │                  └─< artifacts
      │              └─> tests ─> suites
      └─ settings (key/value JSON)
```

* `tests.id` is the **stable test identity**: `sha256(relativeFile | describe path | title)` → 20 hex chars. It does not include run ID, project or browser.
* `run_tests` is one test case inside one run for one Playwright project (unique `(run_id, test_id, project)`) and carries the final outcome (`passed | failed | flaky | skipped | timedOut | interrupted`).
* `test_attempts` is one Playwright `TestResult` (retry index, status, duration, stdout/stderr).
* Binary artifacts live on disk in `dashboard-data/artifacts/<runId>/<testId>/`; the `artifacts` table stores relative paths only.

## Status rules

* Attempt status: Playwright's `TestResult.status`.
* Test outcome inside a run: Playwright's `TestCase.outcome()` → `expected` = passed (or skipped when the expected status is skipped), `unexpected` = failed / timedOut / interrupted (by last attempt status), `flaky` = failed then passed on retry.
* Run status: `failed` if any test outcome is unexpected, otherwise `passed`; `interrupted`/`timedout` when Playwright reports it.

## Flaky detection (explainable, configurable in Settings)

Looking at a test's last `windowRuns` executions (default 20, min `minExecutions` = 3):

1. **Retry-flaky** — any execution had outcome `flaky` (failed then passed on retry).
2. **Unstable rate** — failure rate strictly between `failureRateMin` (10 %) and `failureRateMax` (90 %) with at least one pass and one failure.
3. **Alternating** — at least `minTransitions` (3) pass↔fail transitions in the window.

A test is flagged flaky when any rule matches; the matching rules are shown as reasons.

## Extension points

| Future feature | Where it plugs in |
|---|---|
| Jenkins / other CI | `reporter/ci/adapters.ts` — implement `CiAdapter.detect(env)` and add to the list |
| GitHub API sync | `server/integrations/github/` — `GitHubClient` interface; token stays server-side, never sent to the browser |
| Slack / email / JIRA | `server/integrations/notifications/` — `RunEventListener` invoked from `ingest` after a run is stored |
| AI analysis / clustering | consume `errors` + `test_attempts` through the same services layer; store outputs in new tables |
| Ownership, quality gates, comparisons, perf/API results | new tables joined on `tests.id` / `runs.id`; API under `/api/*` |

## Security

* Server binds `127.0.0.1` unless `QA_DASHBOARD_HOST` is set explicitly.
* Artifact routes resolve files only from DB records, then verify the resolved absolute path is inside the artifact root.
* Importer validates every zip entry / relative path (rejects absolute paths, `..`, drive letters).
* Trace viewer launches `playwright show-trace` (resolved from the repo's own `@playwright/test` install) with an internal, validated artifact path — never a path supplied by the client.
* No GitHub token is required to build URLs; if one is later configured it is read server-side only.
