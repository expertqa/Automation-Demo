# QA Dashboard

Local-first test observability for this Playwright suite: run history, test history, suite analytics, failure triage with screenshots / video / traces, flaky detection, and commit-pinned GitHub source links. No cloud services — SQLite + local files, served on `127.0.0.1`.

## Requirements

- Node.js **20+** (the repo's Playwright still works on 18, the dashboard does not)
- npm
- The repository's own Playwright install (`npm install` at the repo root) — the dashboard reuses it to open traces

## Installation

```bash
npm install                 # repo root: Playwright + browsers (existing behaviour)
npm run dashboard:install   # dashboard dependencies (tools/qa-dashboard/node_modules)
```

`npm run dashboard` installs the dashboard dependencies automatically on first use if you skip the second step.

## Start the dashboard

```bash
npm run dashboard
# → http://localhost:3000
```

The first start builds the React app (about 10 s). Use `npm run dashboard:dev` for a hot-reloading UI on port 5173 with the API on 3001.

Empty dashboard? Load realistic demo data (tagged `demo`, removable from Settings):

```bash
npm run dashboard:seed
```

## Run Playwright tests → results appear automatically

```bash
npm test          # = npx playwright test
```

`playwright.config.js` registers `tools/qa-dashboard/reporter/index.ts` next to the existing `html` and `junit` reporters. On a developer machine the reporter ingests the run straight into `dashboard-data/` when the run finishes; refresh the dashboard and the run is there.

Artifacts are configured as `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'` — failures carry everything the failure page needs, passing tests stay lightweight.

Reporter knobs (environment variables):

| Variable | Effect |
|---|---|
| `QA_DASHBOARD_MODE` | `auto` (default: local on dev, package on CI), `local`, `package`, `off` |
| `QA_DASHBOARD_ENV` | environment label stored with the run (default `qa` in this repo) |
| `QA_DASHBOARD_DATA_DIR` | where SQLite + artifacts live (default `<repo>/dashboard-data`) |
| `QA_DASHBOARD_PACKAGE_DIR` | where the CI package is written (default `<repo>/playwright-dashboard-results`) |
| `QA_DASHBOARD_REPO_URL` / `QA_DASHBOARD_COMMIT_SHA` / `QA_DASHBOARD_BRANCH` | override git detection |

## Import CI results

CI runs the same reporter in **package mode**: it writes `playwright-dashboard-results/` (`results.json` + `artifacts/…`) and the workflow uploads it as the `playwright-dashboard-results` artifact. Download the zip from the GitHub Actions run (or `gh run download <run-id> -n playwright-dashboard-results`) and:

```bash
npm run dashboard ./playwright-dashboard-results.zip      # import, then start
npm run dashboard:import -- ./playwright-dashboard-results.zip   # import only
npm run dashboard:import -- ./some/folder                  # a package dir, or a folder of zips/packages
npm run dashboard:import -- ./x.zip --replace              # overwrite a run that was imported before
```

The importer validates every path (no absolute paths, no `..`, no symlinks in zips), refuses duplicate run IDs unless `--replace` is given, and stores artifacts under `dashboard-data/artifacts/<runId>/<testId>/`.

To create a zip by hand after a `QA_DASHBOARD_MODE=package` run: `npm run dashboard:package`.

## Where data lives

```
dashboard-data/
  dashboard.sqlite          structured history (runs, suites, tests, attempts, errors, artifacts, settings)
  artifacts/<runId>/<testId>/screenshot-r0.png | video-r0.webm | trace-r0.zip | error-context-r0.md
  packages/                 staging area for local runs (emptied after ingest)
  tmp/                      zip extraction scratch
```

Everything is git-ignored. Screenshots, videos and traces are files on disk; the database only stores their relative paths.

## Reset data

```bash
npm run dashboard:reset                 # deletes dashboard-data/ entirely
npm run dashboard -- reset --demo-only  # removes only demo runs (also available in Settings)
```

## GitHub links

Every run stores the repository URL (normalised from `git remote origin` or CI env), branch and commit SHA. Source links are built as

```
{repositoryUrl}/blob/{commitSha}/{relative spec path}#L{line}
```

so they point at the exact code that produced the result, never at a moving branch. Commit and CI-run links are shown when available. No GitHub token is needed; private repositories work because the link is opened in your own browser session. A repository URL override lives in Settings for forks/mirrors. A future GitHub API adapter would keep its token server-side (`server/integrations/`).

## Traces

Failed tests keep `trace.zip`. The failure page offers:

- **Open Playwright Trace** — the server runs `playwright show-trace <file>` with the repository's Playwright install (same version that recorded the trace). The viewer opens in a separate window on the machine running the dashboard. The file path comes from the database row, never from the request.
- **trace.playwright.dev** — the hosted viewer pointed at the locally served trace (artifact routes send CORS headers). Needs internet access.
- **Download**.

Trace handling sits behind `server/trace/adapter.ts` so an embedded viewer can replace the CLI strategy later.

## CI integration

`.github/workflows/playwright.yml`:

1. `QA_DASHBOARD_MODE=package` → the reporter writes the package instead of a database.
2. `actions/upload-artifact` publishes `playwright-dashboard-results` (30-day retention).
3. A second `dashboard` job (PRs / manual runs) typechecks, lints, unit-tests and UI-tests the dashboard itself.

The reporter needs **no dashboard dependencies on CI** — it only uses Node built-ins — so the test job installs nothing extra. `azure-pipelines.yml` publishes the same package as a pipeline artifact.

## CI triggers

The dashboard can trigger a GitHub Actions run directly from the UI ("Run this suite" on a suite's file, "Run full suite" on Overview, "Trigger CI" on a single test's detail page). This posts to `POST /api/ci/run`, which calls GitHub's `workflow_dispatch` REST API for `.github/workflows/playwright.yml`.

To enable it, set the **`GITHUB_TOKEN`** environment variable on the machine/process running the dashboard server (not the browser) to a GitHub Personal Access Token with:

- **`repo`** scope (or fine-grained: Contents: read, Actions: read & write) on `expertqa/Automation-Demo`
- **`workflow`** scope (required to dispatch/update GitHub Actions workflows)

Create one at <https://github.com/settings/tokens>, then start the dashboard with it in the environment, e.g.:

```bash
GITHUB_TOKEN=ghp_xxx npm run dashboard
```

Without `GITHUB_TOKEN` set, the endpoint returns a `400` with a message pointing back here — the buttons still render but show that error instead of crashing the server.

The `workflow_dispatch` API does not return a run id, so a successful trigger links to the workflow's run list (`https://github.com/expertqa/Automation-Demo/actions/workflows/playwright.yml`) instead of a specific run — the newest entry there is your dispatch, usually within a few seconds.

## Flaky detection

Configurable in **Settings**. Over the last *N* executions of a test (default 20, at least 3): flagged when any execution passed only after a retry, when the failure rate is strictly between 10 % and 90 %, or when results flipped pass↔fail at least 3 times. Each flag shows its reasons.

## Developer commands (inside `tools/qa-dashboard`)

```bash
npm run typecheck     # server + app
npm run lint
npm test              # vitest: identity, GitHub URLs, status/flaky/history maths, package validation,
                      #         artifact routing, ingestion, importer (zip-slip), reporter collector, CI adapters, API
npm run build         # React app → app/dist
npm run test:e2e      # Playwright UI tests against a seeded temporary data dir
npm run fixtures:run  # runs a self-contained Playwright project through the reporter (real screenshots/video/trace)
npm run db:generate   # drizzle-kit: generate a migration after editing database/schema.ts
```

From the repo root, `npm run dashboard:test` runs the whole dashboard quality gate.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md). Short version:

```
Playwright → reporter (zero-dep, in-process) → result package → ingest → SQLite + artifacts/ → Fastify API → React UI
```

Folders: `shared/` (pure domain logic), `reporter/` (+ `ci/adapters.ts`), `ingest/` (writer, importer, ingestion), `database/` (Drizzle schema, migrations, seed), `artifacts/` (safe file store), `server/` (routes, services, trace adapter), `cli/`, `app/` (Vite + React + Tailwind + Recharts), `fixtures/`, `tests/`.
