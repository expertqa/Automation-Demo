import fs from "fs";
import path from "path";
/**
 * Generates a random email.
 * @returns {string} A randomly generated email.
 */
export function createEmail() {
  return `secretmissionautomation+${Math.floor(Math.random() * 10000)}@hotmail.com`;
}
/**
 * Generates a secure password with at least one special character.
 * @returns {string} A randomly generated password.
 */
/**
 * Updates a JSON file with the specified key and value for a given object.
 * @param {string} filePath - Path to the JSON file.
 * @param {string} objectKey - Key of the object to update.
 * @param {string} variableKey - Key of the variable to update within the object.
 * @param {string | object} value - New value to set.
 */
export function updateJsonFile(filePath, objectKey, variableKey, value) {
  try {
    // Resolve the file path to ensure correctness
    const absolutePath = path.resolve(filePath);
    // console.log(`Resolved path: ${absolutePath}`);

    // Read the JSON file
    const fileData = fs.readFileSync(absolutePath, "utf-8");
    const data = JSON.parse(fileData);

    // Check if the object key exists
    if (!data[objectKey]) {
      throw new Error(`Object "${objectKey}" does not exist in the file.`);
    }

    // Update the specified variable
    data[objectKey][variableKey] = value;

    // Write the updated JSON back to the file
    fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2), "utf-8");
    // console.log(`Successfully updated ${variableKey} in ${objectKey}.`);
  } catch (error) {
    console.error(`Failed to update JSON file: ${error.message}`);
  }
}

//Create RandomName
export function generateRandomName(prefix) {
  return `${prefix}-${Date.now()}`;
}

// Generate a random integer between min and max (inclusive)
export function generateRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate a future date in 'YYYY-MM-DDTHH:MM' format, offset by given days from today
export function generateFutureDate(daysFromNow = 30) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T00:00`;
}

// Fills a TinyMCE-style rich text editor (an iframe body reached via
// frameLocator/contentFrame). On CI this iframe has been observed to never
// become interactable within several minutes, while it's fine locally — a
// timeout this long pointing at a CI-only cause (network path, asset load)
// rather than a locator bug. Rather than fail with a bare timeout, capture a
// screenshot and the page's iframe count so the next CI run tells us why.
export async function fillRichText(page, frameLocator, text, label) {
  try {
    await frameLocator.click();
    await frameLocator.fill(text);
  } catch (error) {
    const safeLabel = label.replace(/[^a-z0-9-_]/gi, "-");
    const screenshotPath = `rich-text-timeout-${safeLabel}.png`;
    await page
      .screenshot({ path: screenshotPath, fullPage: true })
      .catch(() => {});
    const iframeCount = await page
      .locator("iframe")
      .count()
      .catch(() => "unknown");

    throw new Error(
      `Rich text editor "${label}" never became interactable.\n` +
        `Screenshot saved to ${screenshotPath}.\n` +
        `iframes on page at failure time: ${iframeCount}.\n` +
        `${error.message}`,
    );
  }
}

// utils/helper.js

/**
 * Wraps an async action with retry logic for the app's rate limiting
 * (confirmed max 30s cooldown). Handles both symptoms:
 *   - an in-page "Too many requests" toast after an action that didn't
 *     actually register
 *   - page.goto() failing with ERR_TOO_MANY_REDIRECTS (a rate-limited
 *     request bouncing through an auth/redirect loop)
 *
 * Since the triggering action doesn't register when rate-limited, `action`
 * must be the FULL action to (re)do — not just a check afterward — so the
 * retry actually redoes the click/fill/submit, not just re-polls for a
 * result that never happened.
 */
export async function withRateLimitRetry(page, action, { retries = 3 } = {}) {
  const rateLimitToast = page.getByText(/Too many requests.*?try again/i);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await action();

      // The action itself can "succeed" (no thrown error) while the toast
      // is still what actually happened — e.g. a click that opens no
      // dialog because the request was rejected. Check for the toast
      // immediately after, not just rely on action() throwing.
      const rateLimited = await rateLimitToast
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (!rateLimited) return result;

      if (attempt === retries) {
        throw new Error(`Still rate limited after ${retries} attempts.`);
      }
      console.log(
        `⏳ Rate limited (attempt ${attempt}/${retries}) — waiting 30s before redoing the action...`,
      );
      await page.waitForTimeout(30000);
    } catch (error) {
      const isRedirectError = /ERR_TOO_MANY_REDIRECTS/i.test(error.message);
      if (!isRedirectError) throw error; // real failure, not rate limiting — don't mask it

      if (attempt === retries) throw error;

      console.log(
        `⏳ Too many redirects (attempt ${attempt}/${retries}) — waiting 30s before redoing the action...`,
      );
      await page.waitForTimeout(30000);
    }
  }
}
