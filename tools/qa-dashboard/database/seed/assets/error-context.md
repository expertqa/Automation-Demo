# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: checkout.spec.ts >> Checkout >> applies discount code
- Location: fixtures/specs/checkout.spec.ts:39:7

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('#msg')
Expected: "Discount applied"
Received: "Invalid code"
Timeout:  1500ms

Call log:
  - Expect "toHaveText" with timeout 1500ms
  - waiting for locator('#msg')
    16 × locator resolved to <div id="msg">Invalid code</div>
       - unexpected value "Invalid code"

```

```yaml
- text: Invalid code
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | const storePage = (title: string, total: string) => `<!doctype html>
  4  | <html><head><title>${title}</title>
  5  | <style>
  6  |   body{font-family:system-ui;margin:0;background:#0f172a;color:#e2e8f0}
  7  |   header{padding:16px 24px;border-bottom:1px solid #1e293b;font-weight:600}
  8  |   main{padding:24px;display:grid;gap:12px;max-width:640px}
  9  |   .card{background:#111827;border:1px solid #1f2937;border-radius:8px;padding:16px}
  10 |   button{background:#22c55e;border:0;color:#052e16;padding:8px 14px;border-radius:6px;font-weight:600}
  11 |   .total{font-size:24px;font-weight:700}
  12 | </style></head>
  13 | <body>
  14 | <header>Demo Store — ${title}</header>
  15 | <main>
  16 |   <div class="card"><div>Cart</div><ul id="cart"><li>Mission Planner Pro</li></ul></div>
  17 |   <div class="card"><label>Discount code <input id="code" /></label> <button id="apply">Apply</button><div id="msg"></div></div>
  18 |   <div class="card">Total <span class="total" id="total">${total}</span> <button id="pay">Pay now</button></div>
  19 | </main>
  20 | <script>
  21 |   document.getElementById('apply').addEventListener('click', () => {
  22 |     const code = document.getElementById('code').value;
  23 |     document.getElementById('msg').textContent = code === 'SAVE10' ? 'Discount applied' : 'Invalid code';
  24 |   });
  25 |   document.getElementById('pay').addEventListener('click', () => {
  26 |     setTimeout(() => { document.getElementById('total').textContent = 'Paid'; }, 300);
  27 |   });
  28 | </script>
  29 | </body></html>`;
  30 | 
  31 | test.describe('Checkout', () => {
  32 |   test('adds item to cart', async ({ page }) => {
  33 |     await page.setContent(storePage('Cart', '$49.00'));
  34 |     await test.step('cart contains the product', async () => {
  35 |       await expect(page.locator('#cart li')).toHaveText('Mission Planner Pro');
  36 |     });
  37 |   });
  38 | 
  39 |   test('applies discount code', async ({ page }) => {
  40 |     await page.setContent(storePage('Discount', '$49.00'));
  41 |     await page.fill('#code', 'SAVE20');
  42 |     await page.click('#apply');
  43 |     console.log('applied code SAVE20');
  44 |     // Intentional failure: the demo store only knows SAVE10.
> 45 |     await expect(page.locator('#msg')).toHaveText('Discount applied', { timeout: 1500 });
     |                                        ^ Error: expect(locator).toHaveText(expected) failed
  46 |   });
  47 | 
  48 |   test('confirms payment', async ({ page }, testInfo) => {
  49 |     await page.setContent(storePage('Payment', '$49.00'));
  50 |     await page.click('#pay');
  51 |     // Flaky on purpose: first attempt uses a timeout that is too short.
  52 |     const timeout = testInfo.retry === 0 ? 100 : 2000;
  53 |     await expect(page.locator('#total')).toHaveText('Paid', { timeout });
  54 |   });
  55 | 
  56 |   test.skip('supports gift cards', async () => {
  57 |     // not implemented in the demo store
  58 |   });
  59 | });
  60 | 
```