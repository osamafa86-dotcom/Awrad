import type { NextConfig } from 'next';

/**
 * Sent with every response (final review admin M-3, ops M2). The dashboard's one-click actions («تعطيل الحساب»,
 * «رفض الطلب») must not be clickjackable, so no site may frame it: CSP `frame-ancestors 'none'` and, for older
 * browsers, `X-Frame-Options: DENY`. The Caddy template sets the same on the admin host; repeating them here keeps
 * `next start` (e2e, local) and any other front safe too.
 */
const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig: NextConfig = {
  // A self-contained server (`.next/standalone`) for the VPS image (deploy/vps/Dockerfile.admin).
  output: 'standalone',
  // The workspace packages ship TypeScript sources (no build step), so Next compiles them.
  transpilePackages: ['@awrad/design-tokens', '@awrad/supabase-client', '@awrad/domain'],
  // No `X-Powered-By: Next.js`.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
