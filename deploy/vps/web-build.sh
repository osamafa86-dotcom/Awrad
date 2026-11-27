#!/bin/sh
# The student web (Expo static export) for https://$APP_HOST. Runs inside the `web-build` service
# (workspace target of Dockerfile.admin); /out is $WEB_ROOT on the host (default /srv/sites/www/$SITE-app),
# which the main Caddy serves from its /srv/www/<same name>/current. The URLs come from docker-compose.yml.
# Atomic: the export is copied to /out/releases/<id>, then the relative symlink /out/current is swapped in one
# rename (mv -T); only the two newest releases are kept. Prints counts only.
set -eu
: "${EXPO_PUBLIC_SUPABASE_URL:?web-build: EXPO_PUBLIC_SUPABASE_URL غائب — يضبطه docker-compose.yml من API_HOST}"
: "${EXPO_PUBLIC_SUPABASE_ANON_KEY:?web-build: EXPO_PUBLIC_SUPABASE_ANON_KEY غائب — يضبطه docker-compose.yml من ANON_KEY}"
: "${EXPO_PUBLIC_ADMIN_URL:?web-build: EXPO_PUBLIC_ADMIN_URL غائب — يضبطه docker-compose.yml من ADMIN_HOST}"
unset EXPO_PUBLIC_PREVIEW
# A writable HOME and TMPDIR of our own (Expo keeps state in ~/.expo and caches under TMPDIR), no telemetry, CI mode.
# corepack prepared pnpm as root at image build time; keep finding that cache after HOME moves.
export COREPACK_HOME="${COREPACK_HOME:-$HOME/.cache/node/corepack}"
export HOME=/tmp/home TMPDIR=/tmp/expo-tmp EXPO_NO_TELEMETRY=1 CI=1
mkdir -p "$HOME" "$TMPDIR"
diag() {
  w=no; [ -w "$HOME" ] && w=yes
  echo "web-build: uid $(id -u) · HOME $HOME writable $w · node $(node -p process.versions.node) · pnpm $(pnpm --version) · NODE_OPTIONS ${NODE_OPTIONS:-—} · cpus $(nproc)"
  # cgroup v2: was anything in this container killed for memory, and how high did it go?
  if [ -r /sys/fs/cgroup/memory.events ]; then
    echo "web-build: cgroup oom_kill $(awk '/^oom_kill /{print $2}' /sys/fs/cgroup/memory.events) · peak $(( $(cat /sys/fs/cgroup/memory.peak 2>/dev/null || echo 0) / 1048576 )) MiB · max $(cat /sys/fs/cgroup/memory.max 2>/dev/null)"
  fi
  return 0
}
diag
cd /app
rm -rf apps/mobile/dist
# As CI's production export (no --clear); two Metro workers keep the forks inside the container's memory cap.
if ! pnpm --filter mobile exec expo export -p web --max-workers 2 >/tmp/export.log 2>&1; then
  n=$(wc -l </tmp/export.log)
  echo "web-build: expo export failed — log of $n lines; first 40 (the error names its module here):"
  head -40 /tmp/export.log
  if [ "$n" -gt 40 ]; then echo "web-build: … last 60:"; tail -60 /tmp/export.log; fi
  diag
  exit 1
fi
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
