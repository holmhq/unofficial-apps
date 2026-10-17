#!/bin/sh
# JSON-only runtime smoke. Multipart/media are verified on the deployed app.
set -eu
cd "$(dirname "$0")/.."
TEMP=$(mktemp -d "${TMPDIR:-/tmp}/pastebin-smoke.XXXXXX")
DB=$(mktemp "$TEMP/test.XXXXXX.db"); USER=smoke@pastebin.test; HOST=pastebin.zyt.app; COUNT=0
trap 'rm -rf "$TEMP"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
command -v holm >/dev/null; command -v jq >/dev/null
# A fresh test database needs your explicit acceptance of the Holm Usage
# License. Review it (holm license show), then pass the id@digest it names:
#   HOLM_ACCEPT_LICENSE=holm-usage-license-v1@sha256:... scripts/smoke.sh
if [ -n "${HOLM_ACCEPT_LICENSE:-}" ]; then
  holm test create-user --db "$DB" --email "$USER" --name 'Pastebin Smoke' --accept-license "$HOLM_ACCEPT_LICENSE" >"$TEMP/user" 2>"$TEMP/license" || { cat "$TEMP/license" >&2; exit 1; }
elif ! holm test create-user --db "$DB" --email "$USER" --name 'Pastebin Smoke' >"$TEMP/user" 2>"$TEMP/license"; then
  cat "$TEMP/license" >&2
  echo 'Set HOLM_ACCEPT_LICENSE=<id>@<digest> after reviewing the license (holm license show).' >&2
  exit 1
fi
run() {
  path=$1; shift
  holm test run api/main.js "$path" --db "$DB" --browser strict -H "Host: $HOST" -H "Origin: https://$HOST" "$@" >"$TEMP/response" 2>"$TEMP/runtime" || { cat "$TEMP/runtime" "$TEMP/response" >&2; exit 1; }
}
assert() {
  if ! jq -e "$2" "$TEMP/response" >/dev/null; then printf 'FAIL: %s\n' "$1" >&2; cat "$TEMP/response" >&2; exit 1; fi
  COUNT=$((COUNT + 1)); printf 'PASS: %s\n' "$1"
}
run /api/me
assert 'me signed out' '.status == 200 and .body.ok and .body.authenticated == false and .body.member == null'
run /api/me -u "$USER"
assert 'me signed in, profile saved' '.status == 200 and .body.ok and .body.authenticated and .body.member.name == "Pastebin Smoke"'
run /api/keys -X POST -u "$USER" -d '{"name":"smoke"}'
assert 'create hashed API key' '.status == 201 and .body.ok and (.body.key | test("^pb_[A-Za-z0-9]{32}$")) and (.body.record | has("hash") | not)'
KEY=$(jq -r '.body.key' "$TEMP/response"); KEY_ID=$(jq -r '.body.record.id' "$TEMP/response")
run /api/keys -H "Authorization: Bearer $KEY"
assert 'key management is cookie-only' '.status == 401 and .body.error.code == "unauthorized"'
run /api/pastes -X POST -H "Authorization: Bearer $KEY" -d '{"content":"plain paste\nline two","title":"Plain","expires_in":60}'
assert 'create text with numeric expiry and absolute URLs' '.status == 201 and .body.ok and .body.url == ("https://pastebin.zyt.app/p/" + .body.paste.slug) and .body.paste.state == "live" and .body.paste.lines == 2 and .body.paste.expiresAt != null'
PLAIN=$(jq -r '.body.paste.slug' "$TEMP/response")
run "/api/p/$PLAIN"
assert 'anonymous public text, author private' '.status == 200 and .body.paste.content == "plain paste\nline two" and .body.paste.author == null and .body.paste.isOwner == false'
run "/raw/$PLAIN"
assert 'raw text and safe headers' '.status == 200 and .body == "plain paste\nline two" and .headers["Content-Type"] == "text/plain; charset=utf-8" and .headers["X-Content-Type-Options"] == "nosniff" and .headers["Content-Security-Policy"] != null'
run "/api/pastes/$PLAIN" -X PATCH -H "Authorization: Bearer $KEY" -d '{"show_author":true}'
assert 'owner show-author patch' '.status == 200 and .body.paste.showAuthor'
run "/api/p/$PLAIN"
assert 'opt-in public author' '.status == 200 and .body.paste.author.name == "Pastebin Smoke"'
run /api/pastes -X POST -H "Authorization: Bearer $KEY" -d '{"content":"burn secret","title":"Secret title","burn_after_read":true}'
assert 'create burn paste' '.status == 201 and .body.paste.burnAfterRead'
BURN=$(jq -r '.body.paste.slug' "$TEMP/response")
run "/api/p/$BURN"
assert 'GET seals without disclosure or burning' '.status == 200 and .body.paste.sealed and .body.paste.content == null and .body.paste.title == null and .body.paste.files == []'
run "/api/p/$BURN" -u "$USER"
assert 'owner GET sees burn content' '.status == 200 and .body.paste.isOwner and (.body.paste.sealed | not) and .body.paste.content == "burn secret"'
run "/api/p/$BURN/open" -X POST -u "$USER"
assert 'owner explicit open never burns' '.status == 200 and .body.paste.content == "burn secret"'
run "/raw/$BURN"
assert 'burn raw stays sealed' '.status == 403 and .body.error.code == "sealed"'
run "/api/p/$BURN/open" -X POST
assert 'explicit anonymous burn claim returns content once' '.status == 200 and .body.paste.content == "burn secret" and (.body.paste.sealed | not)'
run "/api/p/$BURN/open" -X POST
assert 'second burn claim is 410 burned' '.status == 410 and .body.error.code == "burned"'
run "/api/pastes/$BURN" -H "Authorization: Bearer $KEY"
assert 'burn content was purged' '.status == 200 and .body.paste.state == "burned" and .body.paste.content == null'
run "/api/pastes/$PLAIN/revoke" -X POST -H "Authorization: Bearer $KEY"
assert 'revoke destroys content' '.status == 200 and .body.paste.state == "revoked" and .body.paste.content == null'
run "/api/p/$PLAIN"
assert 'public revoked is 410' '.status == 410 and .body.error.code == "revoked"'
run "/api/pastes/$PLAIN" -X DELETE -H "Authorization: Bearer $KEY"
assert 'delete owner paste' '.status == 200 and .body.ok'
run "/api/p/$PLAIN"
assert 'deleted is 404' '.status == 404 and .body.error.code == "not_found"'
run /api/pastes -u "$USER" -H 'Authorization: Bearer pb_invalid'
assert 'invalid bearer never falls back to cookie' '.status == 401 and .body.error.code == "unauthorized"'
run /api/pastes -H "Authorization: Bearer $KEY"
assert 'owner list omits content' '.status == 200 and .body.ok and ([.body.pastes[] | has("content")] | all(. == false))'
run /api/pastes -X POST -H "Authorization: Bearer $KEY" -d '{}'
assert 'empty paste rejected' '.status == 400 and .body.error.code == "empty"'
run "/api/keys/$KEY_ID" -X DELETE -u "$USER"
assert 'delete API key' '.status == 200 and .body.ok'
run /api/pastes -H "Authorization: Bearer $KEY"
assert 'deleted key cannot authenticate' '.status == 401 and .body.error.code == "unauthorized"'
printf 'SMOKE PASS: %s assertions (strict Holm runtime; multipart deferred to live smoke).\n' "$COUNT"
