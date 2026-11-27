// Metro for a pnpm monorepo: watch the whole repo (workspace packages export .ts source) and
// resolve from both this app's and the root node_modules. NativeWind compiles global.css.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// PREVIEW-2: the dev-only preview routes and fake data client exist only when EXPO_PUBLIC_PREVIEW=1.
// Hiding them from Metro's file map keeps them out of expo-router's route list and every bundle.
if (process.env.EXPO_PUBLIC_PREVIEW !== '1') {
  const under = (...parts) =>
    new RegExp(`^${path.join(projectRoot, ...parts).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\\\/].*`);
  const previewOnly = [under('app', '__preview'), under('src', 'preview')];
  const existing = config.resolver.blockList;
  config.resolver.blockList = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), ...previewOnly];
  // src/lib/supabase.ts requires the fake only inside its preview branch; Metro still resolves that
  // require while bundling, so it resolves to an empty module here (the branch never runs).
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (/(^|[\\/])preview[\\/]fakeSupabase$/.test(moduleName)) return { type: 'empty' };
    return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = withNativeWind(config, { input: './global.css' });
