#!/usr/bin/env bash
# Stand-in for the yt-dlp binary in runner tests: writes the files a real run
# would produce below the `-o` template and emits the same stdout/stderr shape.
set -u

out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then out="$arg"; fi
  prev="$arg"
done

info='{"id":"abc123","title":"Test Video","uploader":"Test Channel","duration":42.5,"upload_date":"20260101","ext":"mp4"}'

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
printf 'video-bytes' > "$base.mp4"
printf '%s' "$info" > "$base.info.json"
printf 'jpeg-bytes' > "$base.jpg"

exit 0
