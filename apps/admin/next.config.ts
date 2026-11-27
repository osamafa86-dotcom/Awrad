import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A self-contained server (`.next/standalone`) for the VPS image (deploy/vps/Dockerfile.admin).
  output: 'standalone',
  // The workspace packages ship TypeScript sources (no build step), so Next compiles them.
  transpilePackages: ['@awrad/design-tokens', '@awrad/supabase-client', '@awrad/domain'],
};

export default nextConfig;
