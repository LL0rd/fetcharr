#!/bin/sh
set -eu

# Static ffmpeg/ffprobe builds, so the runtime image needs no codec packages.
case "$(uname -m)" in
  x86_64) ARCH=amd64 ;;
  aarch64) ARCH=arm64 ;;
  *)
    echo "Unsupported architecture for ffmpeg: $(uname -m)" >&2
    exit 1
    ;;
esac

echo "(ffmpeg) architecture: $ARCH"
curl -fsSL \
  --connect-timeout 5 \
  --max-time 300 \
  --retry 5 \
  --retry-delay 2 \
  -o /tmp/ffmpeg.tar.xz \
  "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${ARCH}-static.tar.xz"

mkdir -p /tmp/ffmpeg
tar xf /tmp/ffmpeg.tar.xz -C /tmp/ffmpeg
mkdir -p /out
cp /tmp/ffmpeg/*/ffmpeg /out/ffmpeg
cp /tmp/ffmpeg/*/ffprobe /out/ffprobe
chmod +x /out/ffmpeg /out/ffprobe
rm -rf /tmp/ffmpeg /tmp/ffmpeg.tar.xz

/out/ffmpeg -version | head -1
