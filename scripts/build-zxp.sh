#!/bin/bash
# Builds a signed, installable .zxp of the extension into dist/.
# Usage: bash scripts/build-zxp.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIGN="$ROOT/vendor-downloads/zxpsign/ZXPSignCmd"
CERT_DIR="$ROOT/signing"
CERT="$CERT_DIR/cert.p12"
PASS_FILE="$CERT_DIR/password.txt"
STAGE="$ROOT/dist/stage"
VERSION="$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$ROOT/extension/CSXS/manifest.xml")"
OUT="$ROOT/dist/Guy-Tal-Toolbox-$VERSION.zxp"

chmod +x "$SIGN"

# One self-signed certificate, reused for every release so updates install over each other.
mkdir -p "$CERT_DIR"
if [ ! -f "$CERT" ]; then
  [ -f "$PASS_FILE" ] || openssl rand -hex 16 > "$PASS_FILE"
  "$SIGN" -selfSignedCert IL Israel "Guy Tal" "Captions for Premiere" "$(cat "$PASS_FILE")" "$CERT" -validityDays 3650
fi

# Copy the extension without dev-only files.
rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE"
rsync -a --exclude '.debug' --exclude '.DS_Store' "$ROOT/extension/" "$STAGE/"
chmod +x "$STAGE/bin/mac-arm64/whisper-cli"

"$SIGN" -sign "$STAGE" "$OUT" "$CERT" "$(cat "$PASS_FILE")" -tsa http://timestamp.digicert.com
"$SIGN" -verify "$OUT"
rm -rf "$STAGE"
cp "$ROOT/install-guide.html" "$ROOT/dist/"

echo
echo "Built: $OUT ($(du -h "$OUT" | cut -f1))"
