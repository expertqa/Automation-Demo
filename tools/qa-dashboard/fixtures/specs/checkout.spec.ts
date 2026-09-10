import { expect, test } from '@playwright/test';

const storePage = (title: string, total: string) => `<!doctype html>
<html><head><title>${title}</title>
<style>
  body{font-family:system-ui;margin:0;background:#0f172a;color:#e2e8f0}
  header{padding:16px 24px;border-bottom:1px solid #1e293b;font-weight:600}
  main{padding:24px;display:grid;gap:12px;max-width:640px}
  .card{background:#111827;border:1px solid #1f2937;border-radius:8px;padding:16px}
  button{background:#22c55e;border:0;color:#052e16;padding:8px 14px;border-radius:6px;font-weight:600}
  .total{font-size:24px;font-weight:700}
</style></head>
<body>
<header>Demo Store — ${title}</header>
<main>
  <div class="card"><div>Cart</div><ul id="cart"><li>Mission Planner Pro</li></ul></div>
  <div class="card"><label>Discount code <input id="code" /></label> <button id="apply">Apply</button><div id="msg"></div></div>
  <div class="card">Total <span class="total" id="total">${total}</span> <button id="pay">Pay now</button></div>
</main>
<script>
  document.getElementById('apply').addEventListener('click', () => {
    const code = document.getElementById('code').value;
    document.getElementById('msg').textContent = code === 'SAVE10' ? 'Discount applied' : 'Invalid code';
  });
  document.getElementById('pay').addEventListener('click', () => {
    setTimeout(() => { document.getElementById('total').textContent = 'Paid'; }, 300);
  });
</script>
</body></html>`;

test.describe('Checkout', () => {
  test('adds item to cart', async ({ page }) => {
    await page.setContent(storePage('Cart', '$49.00'));
    await test.step('cart contains the product', async () => {
      await expect(page.locator('#cart li')).toHaveText('Mission Planner Pro');
    });
  });

  test('applies discount code', async ({ page }) => {
    await page.setContent(storePage('Discount', '$49.00'));
    await page.fill('#code', 'SAVE20');
    await page.click('#apply');
    console.log('applied code SAVE20');
    // Intentional failure: the demo store only knows SAVE10.
    await expect(page.locator('#msg')).toHaveText('Discount applied', { timeout: 1500 });
  });

  test('confirms payment', async ({ page }, testInfo) => {
    await page.setContent(storePage('Payment', '$49.00'));
    await page.click('#pay');
    // Flaky on purpose: first attempt uses a timeout that is too short.
    const timeout = testInfo.retry === 0 ? 100 : 2000;
    await expect(page.locator('#total')).toHaveText('Paid', { timeout });
  });

  test.skip('supports gift cards', async () => {
    // not implemented in the demo store
  });
});
