#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
HOST="$ROOT/host.py"
EXT_ID="${1:-ncnpbjlcfaclamglimgibjbhgmhffcai}"
NAME="com.facebookvideosaver.json"

chmod +x "$HOST"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required." >&2
  exit 1
fi

TMP="$(mktemp)"
python3 - <<PY
import json
from pathlib import Path
src = Path("$ROOT/com.facebookvideosaver.json")
data = json.loads(src.read_text())
data["path"] = "$HOST"
data["allowed_origins"] = ["chrome-extension://$EXT_ID/"]
Path("$TMP").write_text(json.dumps(data, indent=2) + "\n")
PY

DESTS=(
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  "$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
  "$HOME/Library/Application Support/Google/Chrome Beta/NativeMessagingHosts"
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
  "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
  "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
)

installed=0
for dest in "${DESTS[@]}"; do
  parent="$(dirname "$dest")"
  if [[ -d "$parent" ]]; then
    mkdir -p "$dest"
    cp "$TMP" "$dest/$NAME"
    echo "Installed $dest/$NAME"
    installed=$((installed + 1))
  fi
done
rm -f "$TMP"

if [[ "$installed" -eq 0 ]]; then
  mkdir -p "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  python3 - <<PY
import json
from pathlib import Path
dest = Path.home() / "Library/Application Support/Google/Chrome/NativeMessagingHosts/com.facebookvideosaver.json"
data = {
  "name": "com.facebookvideosaver",
  "description": "Facebook Video Saver native host (yt-dlp)",
  "path": "$HOST",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"],
}
dest.write_text(json.dumps(data, indent=2) + "\n")
print(f"Installed {dest}")
PY
fi

echo
echo "Extension ID: $EXT_ID"
echo "Native host:  $HOST"
echo "If Chrome already had the extension loaded, reload it on chrome://extensions."
echo "Install download tools if needed: brew install yt-dlp ffmpeg"
