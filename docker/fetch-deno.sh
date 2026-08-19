#!/bin/sh
set -eu

# yt-dlp needs a JavaScript runtime for YouTube's player challenges; without one
# downloads fail with "HTTP Error 403: Forbidden". See yt-dlp wiki, page EJS.
case "$(uname -m)" in
  x86_64) ARCH=x86_64-unknown-linux-gnu ;;
  aarch64) ARCH=aarch64-unknown-linux-gnu ;;
  *)
    echo "(deno) not available for $(uname -m) — skipping, YouTube support will be limited."
    mkdir -p /out
    exit 0
    ;;
esac

echo "(deno) architecture: $ARCH"
curl -fsSL \
  --connect-timeout 5 \
  --max-time 300 \
  --retry 5 \
  --retry-delay 2 \
  -o /tmp/deno.zip \
  "https://github.com/denoland/deno/releases/latest/download/deno-${ARCH}.zip"

mkdir -p /out
unzip -o /tmp/deno.zip -d /out
chmod +x /out/deno
rm -f /tmp/deno.zip

/out/deno --version
