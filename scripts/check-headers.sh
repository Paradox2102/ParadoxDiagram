#!/usr/bin/env bash
# Check a running Paradox Diagram server: app fallback, cache headers, compression and security headers.
# Usage: scripts/check-headers.sh https://diagram.team2102.org   (or http://127.0.0.1:8080)
# Exit code: the number of failed checks.
set -u
base="${1:?usage: check-headers.sh <base-url>}"
base="${base%/}"
fails=0
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; fails=$((fails + 1)); }
header() { grep -i "^$2:" <<<"$1" | head -1 | cut -d' ' -f2- | tr -d '\r'; }
status() { head -1 <<<"$1" | awk '{print $2}'; }

root=$(curl -sS -D - -o "$tmp/root" "$base/")
[[ "$(status "$root")" == 200 ]] && pass "/ is 200" || fail "/ is $(status "$root")"
[[ "$(header "$root" cache-control)" == *no-cache* ]] && pass "/ Cache-Control no-cache" || fail "/ Cache-Control: $(header "$root" cache-control)"
[[ "$(header "$root" content-security-policy)" == *"frame-ancestors 'none'"* ]] && pass "/ has the Content-Security-Policy" || fail "/ Content-Security-Policy: $(header "$root" content-security-policy)"
[[ "$(header "$root" content-security-policy)" == *"ws://127.0.0.1:*"* ]] && pass "/ CSP allows the live link (ws://127.0.0.1)" || fail "/ CSP has no ws://127.0.0.1:* in connect-src"
[[ "$(header "$root" x-content-type-options)" == nosniff ]] && pass "/ X-Content-Type-Options nosniff" || fail "/ X-Content-Type-Options: $(header "$root" x-content-type-options)"
# Caddy drops its own Server header; a proxy in front (Railway's edge) may add its own.
[[ "$(header "$root" server)" != *[Cc]addy* ]] && pass "/ does not name Caddy in Server" || fail "/ Server: $(header "$root" server)"

other=$(curl -sS -D - -o "$tmp/other" "$base/some/old/link")
if [[ "$(status "$other")" == 200 ]] && grep -q '<div id="root">' "$tmp/other"; then
  pass "an unknown path serves the app"
else
  fail "an unknown path is $(status "$other") or not the app"
fi

api=$(curl -sS -D - -o "$tmp/api" "$base/api")
if [[ "$(status "$api")" == 200 ]] && grep -q '<div id="root">' "$tmp/api"; then pass "/api serves the app"; else fail "/api is $(status "$api") or not the app"; fi
schema=$(curl -sS -D - -o /dev/null "$base/api/schema.json")
[[ "$(status "$schema")" == 200 && "$(header "$schema" content-type)" == application/json* ]] && pass "/api/schema.json is JSON" || fail "/api/schema.json is $(status "$schema") $(header "$schema" content-type)"

idx=$(curl -sS -D - -o /dev/null -H 'Accept-Encoding: zstd, gzip' "$base/icons/index.json")
[[ "$(status "$idx")" == 200 ]] && pass "/icons/index.json is 200" || fail "/icons/index.json is $(status "$idx")"
[[ "$(header "$idx" cache-control)" == "public, max-age=300" ]] && pass "/icons Cache-Control max-age=300" || fail "/icons Cache-Control: $(header "$idx" cache-control)"
[[ -n "$(header "$idx" content-encoding)" ]] && pass "index.json is compressed ($(header "$idx" content-encoding))" || fail "index.json is not compressed"

icon=$(curl -sS -D - -o /dev/null "$base/icons/power/rev/rev-pdh.svg")
[[ "$(status "$icon")" == 200 && "$(header "$icon" content-type)" == image/svg+xml* ]] && pass "/icons/power/rev/rev-pdh.svg is an SVG" || fail "/icons/power/rev/rev-pdh.svg is $(status "$icon") $(header "$icon" content-type)"
noicon=$(curl -sS -D - -o /dev/null "$base/icons/nope.svg")
[[ "$(status "$noicon")" == 404 ]] && pass "a missing icon is 404 (no app fallback)" || fail "a missing icon is $(status "$noicon")"

# Usage pings (src/usage/track.ts) are an empty POST that Caddy answers 204. /e/check is not one of the counted events.
ping=$(curl -sS -D - -o /dev/null -X POST "$base/e/check")
[[ "$(status "$ping")" == 204 ]] && pass "POST /e/check is 204 (usage ping)" || fail "POST /e/check is $(status "$ping")"

asset=$(grep -o 'assets/[^"]*\.js' "$tmp/root" | head -1)
if [[ -n "$asset" ]]; then
  a=$(curl -sS -D - -o /dev/null "$base/$asset")
  [[ "$(header "$a" cache-control)" == *"max-age=31536000"*immutable* ]] && pass "$asset immutable" || fail "$asset Cache-Control: $(header "$a" cache-control)"
else
  fail "no assets/*.js link in /"
fi

printf '%d failed\n' "$fails"
exit "$fails"
