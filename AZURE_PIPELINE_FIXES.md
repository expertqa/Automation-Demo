# Azure Pipeline Failures — Root Causes & Fixes

Summary of why the Playwright suite was failing in Azure Pipelines and what was changed to fix it.

---

## 1. Wrong / malformed base URL
**Symptom:** `net::ERR_NAME_NOT_RESOLVED` and later `page.goto` hitting `https://https/login`.
**Cause:** `playwright.config.js`'s `baseURL` had a duplicated protocol (`"https://https://app.acceptmission.dev/"`) when the environment was switched to staging.
**Fix:** Corrected to a single valid URL.

## 2. Silent login failures corrupting the shared session
**Symptom:** Every test after login (funnel, project, automation, tasks) failed with confusing "element not found" errors — never an auth error.
**Cause:** `global-setup.js` logs in once and saves the session to `state.json`, reused by every other test. `LoginPage.login()` reported success as soon as the Login button was clicked, without checking whether the app actually left `/login`. If credentials were wrong for that environment, the app showed an inline error and stayed on `/login`, but the code still saved that broken, unauthenticated session — breaking every downstream test with no indication that login was the real problem.
**Fix:** `login()` now waits for navigation away from `/login` and throws a clear, specific error (including the page's visible text) if login didn't actually succeed — so a bad credential/environment mismatch fails fast and obviously, instead of cascading into unrelated-looking failures.

## 3. Rich text editor no longer uses an iframe (major recurring timeout cause)
**Symptom:** `locator.fill` timeouts of 2–4 minutes on every Idea/Project/Task description field, waiting on `iframe[title="Rich Text Area"]`.
**Cause:** The application's rich text editor was rewritten to render as a plain `contenteditable` div directly in the page — the iframe the locators were written against no longer exists for these fields (confirmed by direct DOM inspection; the only iframe left on the page is the unrelated Intercom chat widget).
**Fix:** Updated all 7 locator sites across `IdeaPage`, `ProjectPage`, and `TasksPage` to target `[contenteditable="true"]` directly. Added a shared `fillRichText()` helper (`utils/helper.js`) that captures a screenshot and iframe count on any future failure, so a regression here is diagnosable immediately rather than a bare timeout.

## 4. Branding color picker: "element is outside of the viewport"
**Symptom:** `locator.click` timeout on the color hex input, only in CI (fixed `1920x1080` viewport) — not locally (maximized window).
**Cause:** The color popover is fixed-position, not inside a scrollable container, so Playwright's automatic scroll-into-view can't reach it at some viewport sizes even though the element is visible/enabled/stable.
**Fix:** Force the click on this specific, confirmed-safe element instead of waiting on an unsolvable scroll.

## 5. "Links" widget no longer exists in the UI
**Symptom:** `addLink()` timed out waiting for a "Links" section inside the idea detail sidebar.
**Cause:** Verified by live inspection — the sidebar and the idea's Overview tab no longer contain any Links section. This appears to be a genuine product change, not a selector bug.
**Fix:** `addLink()` now checks for the widget and skips it with a clear warning if absent, instead of hard-failing the entire idea flow. **Needs confirmation from the product/client side** on whether Links was intentionally removed.

## 6. Combobox locator collision (side effect of fix #3)
**Symptom:** `strict mode violation: getByRole('combobox') resolved to 2 elements` when setting idea status.
**Cause:** With the rich text editor no longer isolated inside an iframe, its "Paragraph" style-picker is now a real `role="combobox"` element on the main page, colliding with the previously-unique status dropdown locator.
**Fix:** Scoped the status dropdown locator to match by its status-value text, not just its role.

## 7. Funnel creation navigation hang
**Cause:** `page.waitForURL()` defaults to waiting for the `load` event; this SPA keeps background connections open (chat widget, polling), so `load` can hang well past normal timeouts even after navigation genuinely succeeds — the same issue already documented elsewhere in the codebase for `page.goto()`.
**Fix:** Applied the same `waitUntil: 'domcontentloaded'` pattern to this wait.

---

## Verified
All 7 test cases pass consistently against the `.com` (prod) environment. Staging (`.dev`) verification is in progress — see open item below.

## Open item
An intermittent issue was observed on staging where the main navigation (Tools/Ideas/Projects) rendered empty immediately after a fresh login, even though a direct reload of the same session shows it fully populated. This looks like a hydration timing race specific to freshly-authenticated staging sessions rather than a permissions or code issue — currently being verified.
