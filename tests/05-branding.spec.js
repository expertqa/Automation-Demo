import { test, expect } from '@playwright/test';

import { BrandingPage } from '../pages/BrandingPage';

test('Apply company branding', async ({ page }) => {
  const brandingPage = new BrandingPage(page);

  await test.step('Apply company branding', async () => {
    await brandingPage.brandingCompany();
  });
});

test('Reset discards unsaved branding changes', async ({ page }) => {
  const brandingPage = new BrandingPage(page);

  await test.step('Change color without saving, then reset', async () => {
    const { colorBeforeEdit, colorAfterReset } = await brandingPage.resetBrandingCompany();
    expect(colorAfterReset).toBe(colorBeforeEdit);
  });
});
