// @vitest-environment node
import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';

// Final review admin M-3 / ops M2: one-click actions («تعطيل الحساب», «رفض الطلب») were clickjackable because any
// site could frame the dashboard. Every response now forbids framing (both the CSP directive and the legacy header),
// sniffing, and full-URL referrers; Next no longer announces itself.
describe('next.config security headers', () => {
  it('applies the anti-framing and hardening headers to every path', async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((rule) => rule.source === '/:path*');
    expect(all).toBeDefined();
    const headers = Object.fromEntries(all!.headers.map(({ key, value }) => [key.toLowerCase(), value]));
    expect(headers).toMatchObject({
      'content-security-policy': "frame-ancestors 'none'",
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    });
  });

  it('does not send X-Powered-By', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
