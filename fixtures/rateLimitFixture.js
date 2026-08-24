// fixtures/rateLimitFixture.js
import { test as base, expect } from "@playwright/test";

const MAX_RATE_LIMIT_ATTEMPTS = 5;
// Flat, generous wait per your call — no rush, just needs to survive.
// Replaces the old "parse the toast's exact seconds" logic entirely;
// simpler and the confirmed ceiling was 60s anyway, so 80s is real margin.
const COOLDOWN_MS = 80000;

export const RATE_LIMIT_TIME_BUDGET_MS =
  MAX_RATE_LIMIT_ATTEMPTS * (COOLDOWN_MS + 10000);

let globalCooldownUntil = 0;
function markCooldown() {
  const until = Date.now() + COOLDOWN_MS;
  if (until > globalCooldownUntil) globalCooldownUntil = until;
}
async function waitOutGlobalCooldown(page) {
  const remaining = globalCooldownUntil - Date.now();
  if (remaining > 0) {
    console.log(
      `⏳ Active cooldown from an earlier hit — waiting ${Math.round(remaining / 1000)}s before starting...`,
    );
    await page.waitForTimeout(remaining);
  }
}

// The Chrome network-error page (ERR_TOO_MANY_REDIRECTS) is NOT part of the
// app's DOM — addLocatorHandler on the app's toast can never see it, because
// by the time it appears, the app hasn't loaded at all. This checks for that
// error page specifically, as its own recovery path.
async function isOnRedirectErrorPage(page) {
  return page
    .getByText(/redirected you too many times|ERR_TOO_MANY_REDIRECTS/i)
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);
}

async function recoverFromRedirectError(page, attempt) {
  markCooldown();
  console.log(
    `⏳ Redirect-loop error page (attempt ${attempt}/${MAX_RATE_LIMIT_ATTEMPTS}) — waiting ${COOLDOWN_MS / 1000}s then reloading...`,
  );
  await page.waitForTimeout(COOLDOWN_MS);
  try {
    await page.reload({ timeout: 15000 });
  } catch {
    // still looping — next attempt's own waitFor/goto will surface it
  }
}

// Wraps ANY click-that-triggers-navigation pattern, not just page.goto().
// Use this in place of raw `Promise.all([page.waitForURL(...), link.click()])`
// anywhere in page objects — that raw pattern has no rate-limit protection at all.
async function safeWaitForURL(page, urlPattern, triggerAction, options = {}) {
  await waitOutGlobalCooldown(page);

  for (let attempt = 1; attempt <= MAX_RATE_LIMIT_ATTEMPTS; attempt++) {
    try {
      await Promise.all([
        page.waitForURL(urlPattern, options),
        triggerAction(),
      ]);
      return;
    } catch (error) {
      const redirectLooped =
        /ERR_TOO_MANY_REDIRECTS/i.test(error.message) ||
        (await isOnRedirectErrorPage(page));
      if (!redirectLooped || attempt === MAX_RATE_LIMIT_ATTEMPTS) throw error;
      await recoverFromRedirectError(page, attempt);
      // caller's triggerAction (e.g. clicking a link) needs to be re-clickable
      // after reload — that's on the call site, same as your existing createFunnel() retry
    }
  }
}

export const test = base.extend({
  page: async ({ page }, use) => {
    page.setDefaultTimeout(COOLDOWN_MS + 20000);
    const rateLimitToast = page
      .getByText(/Too many requests.*?try again/i)
      .first();
    let totalHits = 0;

    await page.addLocatorHandler(rateLimitToast, async () => {
      totalHits++;
      if (totalHits > MAX_RATE_LIMIT_ATTEMPTS) {
        throw new Error(
          `Still rate limited after ${MAX_RATE_LIMIT_ATTEMPTS} attempts — aborting.`,
        );
      }
      markCooldown();
      console.log(
        `⏳ Rate limited (hit ${totalHits}/${MAX_RATE_LIMIT_ATTEMPTS}) — waiting ${COOLDOWN_MS / 1000}s...`,
      );
      await page.waitForTimeout(COOLDOWN_MS);

      const stillShowing = await rateLimitToast
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (stillShowing) {
        console.log("⏳ Toast still present after cooldown — reloading...");
        try {
          await page.reload({ timeout: 15000 });
        } catch (reloadError) {
          console.log(
            `⚠️ Reload error (${reloadError.message}) — continuing without it.`,
          );
        }
        await rateLimitToast
          .waitFor({ state: "hidden", timeout: 10000 })
          .catch(() => {});
      }
    });

    const originalGoto = page.goto.bind(page);
    page.goto = async (url, options) => {
      await waitOutGlobalCooldown(page);
      for (let attempt = 1; attempt <= MAX_RATE_LIMIT_ATTEMPTS; attempt++) {
        try {
          return await originalGoto(url, options);
        } catch (error) {
          if (
            !/ERR_TOO_MANY_REDIRECTS/i.test(error.message) ||
            attempt === MAX_RATE_LIMIT_ATTEMPTS
          )
            throw error;
          await recoverFromRedirectError(page, attempt);
        }
      }
    };

    // Attach the helper to the page object so page-object methods can reach it
    // without a separate import: `await page.safeWaitForURL(pattern, () => link.click())`
    page.safeWaitForURL = (urlPattern, triggerAction, options) =>
      safeWaitForURL(page, urlPattern, triggerAction, options);

    await use(page);
  },
});

export const SAFE_ACTION_TIMEOUT_MS = COOLDOWN_MS + 20000; // 100000
export { expect };
