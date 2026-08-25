const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: 'https://app.acceptmission.dev/',
    storageState: 'state.json',
  });
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'nav-check.png', fullPage: true });
  const navText = await page.evaluate(() => {
    const nav = document.querySelector('nav');
    return nav ? nav.innerText : 'NO NAV ELEMENT FOUND';
  });
  console.log('Nav text:', JSON.stringify(navText));
  await browser.close();
})();
