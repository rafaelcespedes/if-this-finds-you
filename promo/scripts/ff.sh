#!/bin/sh
# Remotion's own ffmpeg (no Homebrew needed): sh scripts/ff.sh <ffmpeg args>
D="$(cd "$(dirname "$0")/.." && pwd)/node_modules/@remotion/compositor-darwin-arm64"
DYLD_LIBRARY_PATH="$D" exec "$D/ffmpeg" "$@"
