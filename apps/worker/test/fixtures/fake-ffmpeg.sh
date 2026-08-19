#!/usr/bin/env bash
# Stand-in for the ffmpeg binary in post-processing tests: logs its argv and
# writes the output file (always the last argument) instead of transcoding.
set -u

if [ -n "${FAKE_FFMPEG_LOG:-}" ]; then
  printf '%s\n' "$*" >> "$FAKE_FFMPEG_LOG"
fi

if [ "${FAKE_FFMPEG_FAIL:-0}" = "1" ]; then
  echo "ffmpeg: conversion failed" >&2
  exit 1
fi

out="${*: -1}"
mkdir -p "$(dirname "$out")"
printf 'ffmpeg-bytes' > "$out"

exit 0
