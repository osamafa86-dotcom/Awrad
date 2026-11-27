#!/usr/bin/env bash
# Checks that deploy/vps runs any environment from its variables alone (Task 5.1a) — no Docker needed.
#   bash deploy/vps/check-env.sh                          # all checks (CI `check` job)
#   bash deploy/vps/check-env.sh --render <compose> <env>  # print the interpolated file (for a before/after diff)
# The renderer follows Compose interpolation: ${VAR}, ${VAR:-default}, ${VAR-default}, ${VAR:?msg}, ${VAR?msg},
# ${VAR:+alt}, $VAR and $$, with defaults that nest (${A:-/x/${B:-y}}). Values come from the env file only
# (not from this shell), so a result never depends on who runs it. Comments are dropped, as YAML drops them.
set -euo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)
COMPOSE=$DIR/docker-compose.yml

render() {  # render <compose> <env file> → interpolated text on stdout; exit 1 + "VAR: message" on stderr
  python3 -I - "$1" "$2" <<'PY'
import re, sys

def load_env(path):
    env = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
            v = v[1:-1]
        env[k.strip()] = v
    return env

NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")

class Missing(Exception):
    pass

def interpolate(s, env):
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c != "$":
            out.append(c); i += 1; continue
        if s.startswith("$$", i):
            out.append("$"); i += 2; continue
        if s.startswith("${", i):
            depth, j = 1, i + 2
            while j < len(s) and depth:
                if s.startswith("${", j):
                    depth += 1; j += 2; continue
                if s[j] == "}":
                    depth -= 1
                j += 1
            if depth:
                raise SystemExit("render: unclosed ${ in %r" % s)
            out.append(expand(s[i + 2:j - 1], env)); i = j; continue
        m = NAME.match(s, i + 1)
        if m:
            out.append(env.get(m.group(0), "")); i = m.end(); continue
        out.append(c); i += 1
    return "".join(out)

def expand(body, env):
    m = NAME.match(body)
    if not m:
        raise SystemExit("render: bad expression ${%s}" % body)
    name, rest = m.group(0), body[m.end():]
    val, is_set = env.get(name), name in env
    nonempty = is_set and val != ""
    if rest == "":
        return val or ""
    for op in (":-", ":?", ":+", "-", "?", "+"):
        if rest.startswith(op):
            arg = rest[len(op):]
            break
    else:
        raise SystemExit("render: bad expression ${%s}" % body)
    strict = op.startswith(":")
    present = nonempty if strict else is_set
    kind = op[-1]
    if kind == "-":
        return val if present else interpolate(arg, env)
    if kind == "+":
        return interpolate(arg, env) if present else ""
    if not present:  # "?"
        raise Missing("%s: %s" % (name, interpolate(arg, env) or "required variable is missing a value"))
    return val

env = load_env(sys.argv[2])
lines = []
for line in open(sys.argv[1], encoding="utf-8").read().splitlines():
    if line.lstrip().startswith("#"):
        continue
    line = re.sub(r"\s+#\s.*$", "", line)
    try:
        lines.append(interpolate(line, env))
    except Missing as e:
        sys.stderr.write("render: %s\n" % e)
        sys.exit(1)
print("\n".join(l for l in lines if l.strip()))
PY
}

if [ "${1:-}" = --render ]; then
  [ $# -eq 3 ] || { echo "usage: $0 --render <compose> <env file>" >&2; exit 2; }
  render "$2" "$3"; exit $?
fi

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fails=0
ok() { echo "  ✔ $1"; }
ko() { echo "  ✗ $1"; fails=$((fails + 1)); }

# Dummy secrets only: the checks are about names, hosts and paths.
secrets='POSTGRES_PASSWORD=pw-dummy
JWT_SECRET=jwt-dummy
ANON_KEY=anon-dummy
SERVICE_ROLE_KEY=service-dummy
CRON_SECRET='
printf '%s\nSITE=awrad\nADMIN_HOST=awrad.emdatra.org\nAPP_HOST=awrad-app.emdatra.org\nAPI_HOST=awrad-api.emdatra.org\nMAIL_HOST=awrad-mail.emdatra.org\n' \
  "$secrets" > "$T/staging.env"
printf '%s\nSITE=awrad-prod\nADMIN_HOST=awrad.example.org\nAPP_HOST=app.awrad.example.org\nAPI_HOST=api.awrad.example.org\nMAIL_HOST=mail.awrad.example.org\n' \
  "$secrets" > "$T/prod.env"
{ cat "$T/prod.env"; printf 'AWRAD_SECRETS=/srv/custom/secrets\nWEB_ROOT=/srv/custom/web\n'; } > "$T/prod-paths.env"

# assert <label> <env file> <expected SITE> <ADMIN> <APP> <API> <MAIL> <secrets dir> <web root>
assert_env() {
  local label=$1 envf=$2
  if ! render "$COMPOSE" "$envf" > "$T/out.yml" 2> "$T/err.txt"; then
    ko "$label: the file does not render ($(cat "$T/err.txt"))"; return
  fi
  local msg
  if msg=$(python3 -I - "$T/out.yml" "${@:3}" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
site, admin, app, api, mail, secrets, web = sys.argv[2:9]
problems = []
def need(fragment, count=1):  # a whole "KEY: value" line, or a mid-line fragment when it starts with "@"
    n = text.count(fragment) if fragment.startswith("@") else len(re.findall(r"(?m)^\s*" + re.escape(fragment) + r"$", text))
    if n != count:
        problems.append("%r ×%d (expected %d)" % (fragment, n, count))
if re.search(r"^name:", text, re.M):
    problems.append("a top-level name: (the project name must come from -p)")
aliases = {}
for m in re.finditer(r"aliases:[ \t]*(\[[^\]]*\]|(?:\n[ \t]+- [^\n]*)+)", text):
    for a in re.split(r",|\n[ \t]+- ", m.group(1).strip("[]")):
        a = a.strip().strip("-").strip()
        if a:
            aliases[a] = aliases.get(a, 0) + 1
want = {site + "-db": 1, site + "-auth": 2, site + "-rest": 2, site + "-functions": 2, site + "-mail": 2, site + "-admin": 1}
if aliases != want:
    problems.append("aliases %s (expected %s)" % (aliases, want))
keys = re.findall(r"^  ([A-Za-z0-9_.-]+):\s*$", text.split("\nvolumes:\n")[0].split("services:\n", 1)[-1], re.M)
if any(k.startswith("awrad") for k in keys):
    problems.append("service names carry a site: %s" % keys)
for f, n in (("API_EXTERNAL_URL: https://%s" % api, 1), ("GOTRUE_SITE_URL: https://%s" % admin, 1),
             ("GOTRUE_URI_ALLOW_LIST: https://%s,https://%s" % (admin, app), 1),
             ("GOTRUE_SMTP_HOST: %s-mail" % site, 1), ("GOTRUE_SMTP_ADMIN_EMAIL: noreply@%s" % admin, 1),
             ("GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: https://%s/auth-templates/magic-link.html" % api, 1),
             ("@%s-db:5432/postgres" % site, 2), ("PGHOST: %s-db" % site, 2),
             ("GOTRUE_RATE_LIMIT_HEADER: X-Real-Client-IP", 1),
             ('GOTRUE_SMTP_PORT: "1025"', 1), ('GOTRUE_SMTP_USER: ""', 1), ('GOTRUE_SMTP_PASS: ""', 1),
             ('GOTRUE_RATE_LIMIT_EMAIL_SENT: "60"', 1),
             ("- /opt/sites/%s/import:/import" % site, 1),
             ("SUPABASE_URL: https://%s" % api, 2), ("NEXT_PUBLIC_SUPABASE_URL: https://%s" % api, 2),
             ("EXPO_PUBLIC_SUPABASE_URL: https://%s" % api, 1), ("EXPO_PUBLIC_ADMIN_URL: https://%s" % admin, 1),
             ("image: %s-admin:latest" % site, 1), ("image: %s-workspace:latest" % site, 2),
             ("- %s/mail-ui.htpasswd:/run/secrets/mail-ui.htpasswd:ro" % secrets, 1), ("- %s:/out" % web, 1),
             ("awrad.public-url: https://%s" % mail, 1), ("name: deploy_default", 1)):
    need(f, n)
# Ruling FIN-5: the import service is a one-shot on the project network only, in the tools profile, and its output
# carries counts only whatever arguments the ops round passes.
m = re.search(r"(?ms)^  import:\n(.*?)(?=^  [A-Za-z0-9_-]+:\n|^[a-z])", text)
block = m.group(1) if m else ""
for f in ("profiles: [tools]", "networks: [default]", "--counts-only", "PGHOST: %s-db" % site):
    if f not in block:
        problems.append("import service: %r missing" % f)
if "aliases" in block or "web" in block.split("networks:", 1)[-1].split("\n", 1)[0]:
    problems.append("import service joins deploy_default or has aliases")
https = set(re.findall(r"https://([A-Za-z0-9.-]+)", text))
if https != {admin, app, api, mail}:
    problems.append("public URLs %s (expected the four hosts)" % sorted(https))
if site != "awrad":
    for bad in (r"emdatra", r"/opt/sites/awrad/", r"/srv/sites/www/awrad-app", r"(?<![\w-])awrad-(auth|rest|functions|mail|admin|db|workspace|app|api)\b"):
        if re.search(bad, text):
            problems.append("staging leftover /%s/" % bad)
try:  # where PyYAML exists (CI runners, most hosts), the rendered file must also be valid YAML
    import yaml
    yaml.safe_load(text)
except ImportError:
    pass
except Exception as e:
    problems.append("not valid YAML: %s" % str(e).splitlines()[0])
print("; ".join(problems))
sys.exit(1 if problems else 0)
PY
  ); then ok "$label"; else ko "$label: $msg"; fi
}

echo "── deploy/vps: one file, any environment ──"
src=$(grep -v '^[[:space:]]*#' "$COMPOSE" | sed -E 's/[[:space:]]+#[[:space:]].*$//')
leftover=$(printf '%s\n' "$src" | grep -nE 'emdatra|/opt/sites/awrad/|/srv/sites/www/awrad-app|(^|[^A-Za-z0-9_-])awrad-(auth|rest|functions|mail|admin|db|workspace)\b|^name:' || true)
if [ -z "$leftover" ]; then ok "docker-compose.yml names no site, host or path of its own"
else ko "docker-compose.yml still hard-codes: $(printf '%s' "$leftover" | tr '\n' ' ' | cut -c1-300)"; fi
for s in seed-demo.sh web-build.sh migrate.sh; do
  hit=$(grep -v '^[[:space:]]*#' "$DIR/$s" | grep -nE 'emdatra|-p awrad|awrad_default|awrad-(auth|db)\b' || true)
  if [ -z "$hit" ]; then ok "$s names no site or host of its own"
  else ko "$s still hard-codes: $(printf '%s' "$hit" | tr '\n' ' ' | cut -c1-200)"; fi
done

# awrad.caddy.tmpl: the ops task fills __SITE__ (renderer entry "__SITE__": (SITE, 7)); no site name of its own.
TMPL=$DIR/awrad.caddy.tmpl
SITE_TOKENS=7
tleft=$(grep -nv '^[[:space:]]*#' "$TMPL" | grep -i 'awrad' || true)
if [ -z "$tleft" ]; then ok "awrad.caddy.tmpl names no site outside comments"
else ko "awrad.caddy.tmpl still hard-codes: $(printf '%s' "$tleft" | tr '\n' ' ' | cut -c1-300)"; fi
tn=$( (grep -o '__SITE__' "$TMPL" || true) | wc -l | tr -d ' ')
tc=$(grep '^[[:space:]]*#' "$TMPL" | grep -c '__[A-Z_]*__' || true)
if [ "$tn" = "$SITE_TOKENS" ] && [ "$tc" = 0 ]; then ok "awrad.caddy.tmpl: __SITE__ ×$tn, none in a comment"
else ko "awrad.caddy.tmpl: __SITE__ ×$tn (expected $SITE_TOKENS), placeholders in comments: $tc"; fi

# Final review ops I1 / Ruling FIN-3: GoTrue keys its per-client limits (OTP, verify) on the header compose names, and
# the API block sets it from {client_ip} (header_up replaces any value a client sent). Ops M2: framing, sniffing and
# referrer headers on the admin and app blocks (defaults with ?, so the dashboard's own headers win); none on the API
# or the mailbox, which serve JSON and Mailpit's own UI.
if msg=$(python3 -I - "$TMPL" "$COMPOSE" <<'PY'
import re, sys
tmpl = open(sys.argv[1], encoding="utf-8").read()
compose = open(sys.argv[2], encoding="utf-8").read()
problems = []
header = re.search(r"GOTRUE_RATE_LIMIT_HEADER:\s*(\S+)", compose)
if not header:
    problems.append("compose sets no GOTRUE_RATE_LIMIT_HEADER")
else:
    want = "reverse_proxy __SITE__-auth:9999 {\n\t\t\theader_up %s {client_ip}\n\t\t}" % header.group(1)
    if want not in tmpl:
        problems.append("the API block does not send %s {client_ip} to __SITE__-auth" % header.group(1))
blocks = dict(re.findall(r"(?ms)^(__[A-Z]+__) \{\n(.*?)^\}", tmpl))
security = ['?X-Frame-Options "DENY"', '?X-Content-Type-Options "nosniff"', '?Referrer-Policy "strict-origin-when-cross-origin"']
for name in ("__ADMIN__", "__APP__"):
    for line in security:
        if line not in blocks.get(name, ""):
            problems.append("%s lacks %s" % (name, line))
if "frame-ancestors 'none'" not in blocks.get("__ADMIN__", ""):
    problems.append("__ADMIN__ lacks frame-ancestors 'none'")
for name in ("__API__", "__MAIL__"):
    if "X-Frame-Options" in blocks.get(name, "") or "Content-Security-Policy" in blocks.get(name, ""):
        problems.append("%s must not set framing headers" % name)
if sorted(blocks) != ["__ADMIN__", "__API__", "__APP__", "__MAIL__"]:
    problems.append("blocks %s (expected the four)" % sorted(blocks))
print("; ".join(problems))
sys.exit(1 if problems else 0)
PY
); then ok "awrad.caddy.tmpl: client IP to GoTrue's rate limit, security headers on admin/app"
else ko "awrad.caddy.tmpl: $msg"; fi

assert_env "staging (SITE=awrad, *.emdatra.org)" "$T/staging.env" \
  awrad awrad.emdatra.org awrad-app.emdatra.org awrad-api.emdatra.org awrad-mail.emdatra.org \
  /opt/sites/awrad/secrets /srv/sites/www/awrad-app
assert_env "production sample (SITE=awrad-prod, *.example.org)" "$T/prod.env" \
  awrad-prod awrad.example.org app.awrad.example.org api.awrad.example.org mail.awrad.example.org \
  /opt/sites/awrad-prod/secrets /srv/sites/www/awrad-prod-app
assert_env "explicit AWRAD_SECRETS and WEB_ROOT win over the defaults" "$T/prod-paths.env" \
  awrad-prod awrad.example.org app.awrad.example.org api.awrad.example.org mail.awrad.example.org \
  /srv/custom/secrets /srv/custom/web

# Ruling FIN-4: production mail comes from .env (an SMTP provider); without these keys staging keeps Mailpit.
{ cat "$T/prod.env"; printf 'SMTP_HOST=smtp.example.org\nSMTP_PORT=587\nSMTP_USER=apikey\nSMTP_PASS=smtp-dummy\nSMTP_SENDER=no-reply@example.org\nRATE_LIMIT_EMAIL_SENT=400\n'; } > "$T/smtp.env"
if render "$COMPOSE" "$T/smtp.env" > "$T/smtp.yml" 2> "$T/err.txt"; then
  miss=""
  for line in 'GOTRUE_SMTP_HOST: smtp.example.org' 'GOTRUE_SMTP_PORT: "587"' 'GOTRUE_SMTP_USER: "apikey"' \
              'GOTRUE_SMTP_PASS: "smtp-dummy"' 'GOTRUE_SMTP_ADMIN_EMAIL: no-reply@example.org' \
              'GOTRUE_RATE_LIMIT_EMAIL_SENT: "400"'; do
    grep -qxF "      $line" "$T/smtp.yml" || miss="$miss «$line»"
  done
  if [ -z "$miss" ] && ! grep -q 'GOTRUE_SMTP_HOST: awrad-prod-mail' "$T/smtp.yml"; then
    ok "SMTP_* and RATE_LIMIT_EMAIL_SENT from .env replace the Mailpit defaults"
  else ko "SMTP from .env:$miss"; fi
else ko "the SMTP sample does not render ($(cat "$T/err.txt"))"; fi

for v in SITE ADMIN_HOST APP_HOST API_HOST MAIL_HOST; do
  grep -v "^$v=" "$T/prod.env" > "$T/missing.env"
  if render "$COMPOSE" "$T/missing.env" > /dev/null 2> "$T/err.txt"; then
    ko "without $v the file still renders (it has no default)"
  elif grep -q "$v" "$T/err.txt"; then
    ok "without $v: fails and names it ($(head -1 "$T/err.txt"))"
  else
    ko "without $v: fails without naming it ($(head -1 "$T/err.txt"))"
  fi
done

echo
if [ "$fails" -eq 0 ]; then echo "check-env: all checks passed"; else echo "check-env: $fails failed"; exit 1; fi
