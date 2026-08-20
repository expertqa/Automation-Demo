import { test, expect } from '@playwright/test';

import { BrandingPage } from '../pages/BrandingPage';

test('TC-05.1 Apply company branding', async ({ page }) => {
  test.setTimeout(process.env.CI ? 90000 : 30000);

  const brandingPage = new BrandingPage(page);

  await test.step('TC-05.1 Apply company branding', async () => {
    const { color } = await brandingPage.brandingCompany();

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

test('Create funnel', async ({ page }, testInfo) => {
  console.log(`🔄 Retry number: ${testInfo.retry}`);
  // ...
});
