#!/bin/sh
# The student web (Expo static export) for awrad-app.emdatra.org. Runs inside the `web-build` service
# (workspace target of Dockerfile.admin); /out is /srv/sites/www/awrad-app on the host, which the main Caddy
# serves as /srv/www/awrad-app/current.
# Atomic: the export is copied to /out/releases/<id>, then the relative symlink /out/current is swapped in one
# rename (mv -T); only the two newest releases are kept. Prints counts only.
set -eu
: "${EXPO_PUBLIC_SUPABASE_URL:?}" "${EXPO_PUBLIC_SUPABASE_ANON_KEY:?}" "${EXPO_PUBLIC_ADMIN_URL:?}"
unset EXPO_PUBLIC_PREVIEW
cd /app
rm -rf apps/mobile/dist
pnpm --filter mobile exec expo export -p web --clear >/tmp/export.log 2>&1 || { tail -40 /tmp/export.log; exit 1; }
tail -3 /tmp/export.log
test -f apps/mobile/dist/index.html || { echo "web-build: dist/index.html missing"; exit 1; }
# -w: whole words, as in CI — expo-router's own `__internal__previewId` does not count.
if grep -rlw "fakeSupabase\|__preview" apps/mobile/dist/ >/dev/null; then echo "web-build: preview code in the export"; exit 1; fi

id=$(date -u +%Y%m%d%H%M%S)
mkdir -p /out/releases
# Leftovers of an interrupted copy are never live: remove them.
find /out/releases -mindepth 1 -maxdepth 1 -type d -name '*.tmp' -exec rm -rf {} +
rm -rf "/out/releases/$id.tmp"
cp -a apps/mobile/dist "/out/releases/$id.tmp"
chmod -R a+rX "/out/releases/$id.tmp"
mv "/out/releases/$id.tmp" "/out/releases/$id"
ln -sfn "releases/$id" /out/.current.new
mv -T /out/.current.new /out/current
# Keep the live release and the one before it.
find /out/releases -mindepth 1 -maxdepth 1 -type d ! -name '*.tmp' -printf '%f\n' | sort -r | tail -n +3 \
  | while read -r old; do rm -rf "/out/releases/$old"; done
echo "web-build: release $id · files $(find /out/current/ -type f | wc -l) · html $(find /out/current/ -name '*.html' | wc -l) · lang=ar $(grep -c 'lang="ar"' /out/current/index.html)"
