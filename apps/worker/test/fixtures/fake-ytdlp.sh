#!/usr/bin/env bash
# Stand-in for the yt-dlp binary in runner tests: writes the files a real run
# would produce below the `-o` template and emits the same stdout/stderr shape.
set -u

out=""
prev=""
subs_only=0
embed_clients=0
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then out="$arg"; fi
  if [ "$arg" = "--skip-download" ]; then subs_only=1; fi
  case "$arg" in youtube:player_client=tv_embedded*) embed_clients=1 ;; esac
  prev="$arg"
done

# FAKE_ARGS_LOG: ein Aufruf pro Zeile, damit Tests die Argumente jedes Laufs sehen.
if [ -n "${FAKE_ARGS_LOG:-}" ]; then printf '%s\n' "$*" >> "$FAKE_ARGS_LOG"; fi

info='{"id":"abc123","title":"Test Video","uploader":"Test Channel","duration":42.5,"upload_date":"20260101","ext":"mp4"}'

# FAKE_AGE_GATE=1: wie YouTube bei altersbeschraenkten Videos — nur die
# Embed-Clients kommen durch.
if [ "${FAKE_AGE_GATE:-0}" = "1" ] && [ "$embed_clients" = "0" ]; then
  echo "ERROR: [youtube] abc123: Sign in to confirm your age. This video may be inappropriate for some users." >&2
  exit 1
fi

if [ "${FAKE_FAIL:-0}" = "1" ]; then
  echo "ERROR: [youtube] abc123: Video unavailable" >&2
  exit 1
fi

echo "$info"

if [ "${FAKE_SLEEP:-0}" != "0" ]; then
  sleep "${FAKE_SLEEP}"
fi

echo '[download]   0.0% of  100.00MiB at  1.00MiB/s ETA 00:20' >&2
echo '[download]  50.0% of  100.00MiB at  2.00MiB/s ETA 00:10' >&2
echo '[download] 100.0% of  100.00MiB in 00:20' >&2

base=$(printf '%s' "$out" | sed \
  -e 's|%(uploader)s|Test Channel|g' \
  -e 's|%(title)s|Test Video|g' \
  -e 's|%(id)s|abc123|g' \
  -e 's|\.%(ext)s$||')

mkdir -p "$(dirname "$base")"
printf '%s' "$info" > "$base.info.json"
printf 'jpeg-bytes' > "$base.jpg"

# --skip-download: kein Medienstrom, dafuer eine Spur je angeforderter Sprache.
if [ "$subs_only" = "1" ]; then
  printf 'srt-bytes-en' > "$base.en.srt"
  printf 'srt-bytes-de' > "$base.de.srt"
else
  printf 'video-bytes' > "$base.mp4"
fi

exit 0
