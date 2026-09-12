// fixtures/dashboardFixtures.js
//
// View-only live browser preview for QA Dashboard-triggered CI runs. Wraps the
// `page` fixture so every test gets it automatically without touching test
// bodies — extend this file's `test` (directly or, like
// fixtures/rateLimitFixture.js does, by extending further) to opt in.
//
// Entirely inert unless DASHBOARD_RUN_ID / DASHBOARD_RUN_TOKEN /
// DASHBOARD_INGEST_URL are all set (only true for a dashboard-triggered CI
// run) — plain local runs and push/PR-triggered CI runs are unaffected.
//
// Captures frames via CDP Page.startScreencast (falls back to periodic
// page.screenshot() if CDP screencasting throws) and POSTs each one to the
// dashboard's ingestion endpoint. Nothing here reads input from the dashboard
// or exposes any control surface back to it — frames flow one way only.
import { test as base, expect } from "@playwright/test";

const RUN_ID = process.env.DASHBOARD_RUN_ID;
const RUN_TOKEN = process.env.DASHBOARD_RUN_TOKEN;
const INGEST_URL = process.env.DASHBOARD_INGEST_URL;
const ENABLED = Boolean(RUN_ID && RUN_TOKEN && INGEST_URL);

const FRAME_MIN_INTERVAL_MS = 450; // client-side throttle; the backend also caps this independently
const SCREENSHOT_FALLBACK_INTERVAL_MS = 500;
const FRAME_QUALITY = 50;
const MAX_DIMENSION = 1024;

function frameUrl() {
  return `${INGEST_URL.replace(/\/$/, "")}/${RUN_ID}/frame`;
}

async function postFrame(buffer, contentType) {
  try {
    await fetch(frameUrl(), {
      method: "POST",
      headers: { "Content-Type": contentType, Authorization: `Bearer ${RUN_TOKEN}` },
      body: buffer,
    });
  } catch {
    // Best-effort: a dropped preview frame must never fail or slow the actual test.
  }
}

/** CDP screencast: continuous, low-overhead frames straight from the renderer. */
async function attachCdpScreencast(page) {
  const client = await page.context().newCDPSession(page);
  let lastSentAt = 0;
  let sending = false;

  const onFrame = async (event) => {
    // Always ack immediately — Chromium pauses the screencast until it does, regardless of whether we forward the frame.
    client.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
    const now = Date.now();
    if (sending || now - lastSentAt < FRAME_MIN_INTERVAL_MS) return;
    lastSentAt = now;
    sending = true;
    try {
      await postFrame(Buffer.from(event.data, "base64"), "image/jpeg");
    } finally {
      sending = false;
    }
  };

  client.on("Page.screencastFrame", onFrame);
  await client.send("Page.startScreencast", { format: "jpeg", quality: FRAME_QUALITY, maxWidth: MAX_DIMENSION, maxHeight: MAX_DIMENSION, everyNthFrame: 1 });

  return async function detach() {
    client.off("Page.screencastFrame", onFrame);
    await client.send("Page.stopScreencast").catch(() => {});
    await client.detach().catch(() => {});
  };
}

/** Fallback when CDP screencasting isn't available: periodic page.screenshot() polling. */
function attachScreenshotPolling(page) {
  let capturing = false;
  const timer = setInterval(async () => {
    if (capturing || page.isClosed()) return;
    capturing = true;
    try {
      const buf = await page.screenshot({ type: "jpeg", quality: FRAME_QUALITY });
      await postFrame(buf, "image/jpeg");
    } catch {
      // page mid-navigation, closed, etc. — just skip this tick
    } finally {
      capturing = false;
    }
  }, SCREENSHOT_FALLBACK_INTERVAL_MS);

  return async function detach() {
    clearInterval(timer);
  };
}

export const test = base.extend({
  page: async ({ page }, use) => {
    if (!ENABLED) {
      await use(page);
      return;
    }

    let detach;
    try {
      detach = await attachCdpScreencast(page);
    } catch {
      detach = attachScreenshotPolling(page);
    }

    try {
      await use(page);
    } finally {
      await detach();
    }
  },
});

export { expect };
