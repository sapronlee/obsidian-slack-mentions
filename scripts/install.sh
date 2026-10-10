#!/bin/sh
# Copy the plugin files into a vault for local testing: scripts/install.sh /path/to/vault
set -eu
VAULT="${1:?usage: scripts/install.sh /path/to/vault}"
DEST="$VAULT/.obsidian/plugins/slack-mentions"
cd "$(dirname "$0")/.."
mkdir -p "$DEST"
cp main.js manifest.json styles.css "$DEST/"
echo "Installed to $DEST (reload the plugin in Obsidian to pick it up)"
