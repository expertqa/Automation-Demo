# accept-mission-playwright

Playwright end-to-end tests for the Accept Mission platform.

```bash
npm install                    # dependencies + browsers
npx playwright test            # run the suite (headless on CI, headed locally)
npm run show-report            # Playwright HTML report
```

## QA Dashboard

Local test observability (run history, failures with screenshots / video / traces, flaky detection, GitHub source links):

```bash
npm run dashboard              # http://localhost:3000
npm run dashboard:seed         # demo data
npm test                       # every local run is recorded automatically
npm run dashboard ./playwright-dashboard-results.zip   # import a CI package
```

Full documentation: [tools/qa-dashboard/README.md](tools/qa-dashboard/README.md).
