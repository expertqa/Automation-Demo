import { test, expect } from '@playwright/test';

import { BrandingPage } from '../pages/BrandingPage';

test('TC-05.1 Apply company branding', async ({ page }) => {
  test.setTimeout(process.env.CI ? 90000 : 30000);

  const brandingPage = new BrandingPage(page);

  await test.step('TC-05.1 Apply company branding', async () => {
    await brandingPage.brandingCompany();
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
