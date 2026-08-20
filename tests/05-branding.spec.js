import { test, expect } from '@playwright/test';

import { BrandingPage } from '../pages/BrandingPage';

test('TC-05.1 Apply company branding', async ({ page }) => {
  test.setTimeout(process.env.CI ? 90000 : 30000);

  const brandingPage = new BrandingPage(page);

  await test.step('TC-05.1 Apply company branding', async () => {
    const { color } = await brandingPage.brandingCompany();

    // Reload and confirm the color actually persisted server-side, not just
    // that the save button was clicked without error. The app appends an
    // alpha channel when it stores the value (e.g. "#4F46E5" -> "#4F46E5FF"),
    // confirmed live, so match on the RGB prefix rather than an exact string.
    await brandingPage.navigateToBranding();
    await expect(brandingPage.colorButton, 'Brand color should persist after reload').toHaveText(new RegExp(`^${color}(FF)?$`, 'i'));
  });
});

test('TC-05.2 Reset discards unsaved branding changes', async ({ page }) => {
  test.setTimeout(process.env.CI ? 90000 : 30000);

  const brandingPage = new BrandingPage(page);

  await test.step('TC-05.2 Change color without saving, then reset', async () => {
    const { colorBeforeEdit, colorAfterReset } = await brandingPage.resetBrandingCompany();
    expect(colorAfterReset).toBe(colorBeforeEdit);
  });
});
