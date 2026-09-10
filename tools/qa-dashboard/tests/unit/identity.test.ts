import { describe, expect, it } from 'vitest';
import { newRunId, resolveSuiteName, stableTestId, suiteId, suiteNameFromFile, toPosixPath } from '../../shared/identity';

describe('stableTestId', () => {
  it('is deterministic and independent of run/project/line', () => {
    const a = stableTestId('tests/01-login.spec.js', ['TC-01 — Login']);
    const b = stableTestId('tests/01-login.spec.js', ['TC-01 — Login']);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{20}$/);
  });
  it('changes when the file, describe path or title changes', () => {
    const base = stableTestId('tests/a.spec.ts', ['Suite', 'does x']);
    expect(stableTestId('tests/b.spec.ts', ['Suite', 'does x'])).not.toBe(base);
    expect(stableTestId('tests/a.spec.ts', ['Other', 'does x'])).not.toBe(base);
    expect(stableTestId('tests/a.spec.ts', ['Suite', 'does y'])).not.toBe(base);
  });
  it('normalises windows separators and leading ./', () => {
    expect(stableTestId('.\\tests\\a.spec.ts', ['t'])).toBe(stableTestId('tests/a.spec.ts', ['t']));
    expect(toPosixPath('./tests\\x.spec.ts')).toBe('tests/x.spec.ts');
  });
});

describe('suite naming', () => {
  it('derives a human name from the file when there is no describe', () => {
    expect(suiteNameFromFile('tests/02-createFunnel.spec.js')).toBe('Create Funnel');
    expect(suiteNameFromFile('tests/checkout/payment.spec.ts')).toBe('Payment');
    expect(suiteNameFromFile('tests/01-login.spec.js')).toBe('Login');
    expect(suiteNameFromFile('unstable/06-tasks.spec.js')).toBe('Tasks');
  });
  it('prefers the first describe title', () => {
    expect(resolveSuiteName('tests/x.spec.ts', ['Checkout', 'Payments'])).toBe('Checkout');
    expect(resolveSuiteName('tests/x.spec.ts', [])).toBe('X');
  });
  it('suite ids are case-insensitive and stable', () => {
    expect(suiteId('Checkout')).toBe(suiteId('checkout '));
    expect(suiteId('Checkout')).not.toBe(suiteId('Payments'));
  });
});

describe('newRunId', () => {
  it('is time-sortable and unique', () => {
    const a = newRunId(new Date('2026-01-01T00:00:00Z'), () => 0.1);
    const b = newRunId(new Date('2026-01-02T00:00:00Z'), () => 0.1);
    expect(a < b).toBe(true);
    expect(a).toMatch(/^run_[0-9A-Z]{22}$/);
  });
});
