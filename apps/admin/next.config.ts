import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The workspace packages ship TypeScript sources (no build step), so Next compiles them.
  transpilePackages: ['@awrad/design-tokens', '@awrad/supabase-client', '@awrad/domain'],
};

export default nextConfig;
